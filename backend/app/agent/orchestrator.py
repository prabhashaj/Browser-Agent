"""backend/app/agent/orchestrator.py — Per-run agent loop."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.api.ws import CMD_QUEUES, RUN_QUEUES, cleanup_queues, get_or_create_queues
from app.config import get_settings
from app.db.session import AsyncSessionLocal
from app.db.models import Message, Run
from app.llm.provider import ChatMessage, get_primary_llm

logger = logging.getLogger(__name__)

_seq_counters: dict[str, int] = {}


def _next_seq(run_id: str) -> int:
    _seq_counters[run_id] = _seq_counters.get(run_id, 0) + 1
    return _seq_counters[run_id]


def _ts() -> str:
    return datetime.now(timezone.utc).isoformat()


async def emit(run_id: str, event: dict) -> None:
    """Put an event onto the run's event queue."""
    q = RUN_QUEUES.get(run_id)
    if q:
        event.setdefault("run_id", run_id)
        event.setdefault("seq", _next_seq(run_id))
        event.setdefault("ts", _ts())
        try:
            await asyncio.wait_for(q.put(event), timeout=5.0)
        except (asyncio.TimeoutError, asyncio.QueueFull):
            logger.warning("Event queue full / timeout for run %s, dropping event %s", run_id, event.get("type"))


async def get_command(run_id: str, timeout: float | None = None) -> dict | None:
    """Pop next client command from the command queue."""
    q = CMD_QUEUES.get(run_id)
    if not q:
        return None
    try:
        if timeout is not None:
            return await asyncio.wait_for(q.get(), timeout=timeout)
        return q.get_nowait()
    except (asyncio.TimeoutError, asyncio.QueueEmpty):
        return None


async def run_agent(run_id: str, user_id: str, goal: str, assistant_msg_id: str) -> None:
    """
    Main agent entry point. Called as a background task.
    Phase 1: handles chat-only routing with streaming reply.
    Browser task loop is wired in Phase 3.
    """
    settings = get_settings()
    get_or_create_queues(run_id)

    async with AsyncSessionLocal() as db:
        # Update run status to running
        from sqlalchemy import select
        result = await db.execute(select(Run).where(Run.id == run_id))
        run = result.scalar_one_or_none()
        if not run:
            logger.error("Run %s not found", run_id)
            return
        run.status = "running"
        await db.commit()

        llm = get_primary_llm()

        # Build conversation history from thread messages
        from app.db.models import Thread
        from sqlalchemy.orm import selectinload
        thread_result = await db.execute(
            select(Thread)
            .where(Thread.id == run.thread_id)
            .options(selectinload(Thread.messages))
        )
        thread = thread_result.scalar_one_or_none()
        history: list[ChatMessage] = []
        if thread:
            for msg in thread.messages:
                if msg.id == assistant_msg_id:
                    continue  # skip the empty placeholder
                if msg.role in ("user", "assistant") and msg.text:
                    history.append({"role": msg.role, "content": msg.text})

        # Route: chat or browser task?
        from app.agent.router import route
        router_result = await route(goal, history[:-1] if history else [], llm)

        if router_result.action == "chat":
            # Stream chat reply
            full_text = ""
            async for delta in llm.stream_chat(
                history,
                system="You are Pilot, a helpful AI assistant. Be concise and friendly.",
            ):
                full_text += delta
                await emit(run_id, {"type": "message_delta", "delta": delta})
            await emit(run_id, {"type": "message_done"})

            # Persist the assistant message
            result = await db.execute(select(Message).where(Message.id == assistant_msg_id))
            msg = result.scalar_one_or_none()
            if msg:
                msg.text = full_text
            run.status = "done"
            await db.commit()

        else:
            # Browser task — placeholder for Phase 3
            await emit(run_id, {
                "type": "task_started",
                "goal": router_result.goal,
                "title": router_result.goal[:120],
            })
            # TODO Phase 3: planner → observe → decide → execute loop
            # For now emit a blocked event explaining Phase 3 is not yet implemented
            await asyncio.sleep(1)
            await emit(run_id, {
                "type": "task_failed",
                "message": "Browser execution coming in Phase 3. Chat is fully working!",
            })
            run.status = "failed"
            await db.commit()

    # Signal the WS that this run is done
    await emit(run_id, None)  # type: ignore[arg-type]
    _seq_counters.pop(run_id, None)
    cleanup_queues(run_id)
