"""
backend/app/agent/orchestrator.py
===================================
Per-run agent entry point.

Full loop (per step):
  Route → Plan → Observe → Decide → Write text → Policy gate → Execute → Verify

Chat-only path: route → stream reply → done
Browser path:   route → open browser → step loop → summarize → done
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.api.ws import CMD_QUEUES, RUN_QUEUES, cleanup_queues, get_or_create_queues
from app.config import get_settings
from app.db.session import AsyncSessionLocal
from app.llm.provider import ChatMessage, get_primary_llm
from app.schemas.events import Operation

logger = logging.getLogger(__name__)

_seq_counters: dict[str, int] = {}


def _next_seq(run_id: str) -> int:
    _seq_counters[run_id] = _seq_counters.get(run_id, 0) + 1
    return _seq_counters[run_id]


def _ts() -> str:
    return datetime.now(timezone.utc).isoformat()


async def emit(run_id: str, event: dict) -> None:
    q = RUN_QUEUES.get(run_id)
    if q:
        event.setdefault("run_id", run_id)
        event.setdefault("seq", _next_seq(run_id))
        event.setdefault("ts", _ts())
        try:
            await asyncio.wait_for(q.put(event), timeout=5.0)
        except (asyncio.TimeoutError, asyncio.QueueFull):
            logger.warning("Event queue full/timeout for run %s: %s", run_id, event.get("type"))


async def get_command(run_id: str, timeout: float | None = None) -> dict | None:
    q = CMD_QUEUES.get(run_id)
    if not q:
        return None
    try:
        if timeout is not None:
            return await asyncio.wait_for(q.get(), timeout=timeout)
        return q.get_nowait()
    except (asyncio.TimeoutError, asyncio.QueueEmpty):
        return None


async def _is_cancelled(run_id: str) -> bool:
    from sqlalchemy import select
    from app.db.models import Run
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Run).where(Run.id == run_id))
        run = result.scalar_one_or_none()
        return run is None or run.status == "cancelled"


async def run_agent(run_id: str, user_id: str, goal: str, assistant_msg_id: str) -> None:
    settings = get_settings()
    get_or_create_queues(run_id)

    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        from app.db.models import Message, Run, Thread

        result = await db.execute(select(Run).where(Run.id == run_id))
        run = result.scalar_one_or_none()
        if not run:
            return

        run.status = "running"
        await db.commit()

        llm = get_primary_llm()

        # Build conversation history
        thread_result = await db.execute(
            select(Thread).where(Thread.id == run.thread_id).options(selectinload(Thread.messages))
        )
        thread = thread_result.scalar_one_or_none()
        history: list[ChatMessage] = []
        if thread:
            for msg in thread.messages:
                if msg.id == assistant_msg_id:
                    continue
                if msg.role in ("user", "assistant") and msg.text:
                    history.append({"role": msg.role, "content": msg.text})

        # Route
        from app.agent.router import route
        router_result = await route(goal, history[:-1] if history else [], llm)

        final_result: dict | None = None

        if router_result.action == "chat":
            # ── Chat path ──────────────────────────────────────────────────────
            full_text = ""
            async for delta in llm.stream_chat(
                history,
                system="You are Pilot, a helpful and concise AI assistant.",
            ):
                full_text += delta
                await emit(run_id, {"type": "message_delta", "delta": delta})

            await emit(run_id, {"type": "message_done"})

            msg_result = await db.execute(select(Message).where(Message.id == assistant_msg_id))
            msg = msg_result.scalar_one_or_none()
            if msg:
                msg.text = full_text
            run.status = "done"
            await db.commit()

        else:
            # ── Browser task path ───────────────────────────────────────────────
            task_goal = router_result.goal
            start_url = router_result.start_url or "https://www.google.com"

            await emit(run_id, {"type": "task_started", "goal": task_goal, "title": task_goal[:120]})

            from app.browser.session_manager import BrowserSession
            from app.agent.secrets import SecretBroker

            secret_broker = SecretBroker(
                run_id=run_id,
                vault_key_hex=settings.secret_encryption_key or None,
            )

            async def _emit_for_browser(event: dict) -> None:
                await emit(run_id, event)

            try:
                async with BrowserSession(run_id, settings, _emit_for_browser) as browser:
                    await browser.navigate(start_url)

                    from app.agent.observer import observe
                    from app.agent.decider.llm import LLMDecider
                    from app.agent.executor import execute
                    from app.agent.policy import PolicyContext, PolicyVerdict, evaluate as policy_eval
                    from app.agent.secrets import SecretField, SecretRequest, is_secret_field
                    from app.browser.screencast import get_page_snapshot

                    decider = LLMDecider(llm)
                    step_history: list[dict] = []
                    step_index = 0

                    while step_index < settings.max_steps_per_run:
                        if await _is_cancelled(run_id):
                            logger.info("Run %s cancelled", run_id)
                            break

                        # Check for stop command
                        cmd = await get_command(run_id)
                        if cmd and cmd.get("cmd") == "stop":
                            break

                        # Observe
                        elements, page_text, page_url = await observe(browser.page)

                        await emit(run_id, {
                            "type": "element_table",
                            "step_id": f"obs-{step_index}",
                            "elements": elements,
                        })

                        # Decide
                        from app.agent.decider.base import DecisionInput
                        decision = await decider.decide(DecisionInput(
                            goal=task_goal,
                            url=page_url,
                            page_text=page_text,
                            elements=elements,
                            history=step_history,
                            step_index=step_index,
                        ))

                        logger.info("Run %s step %d: %s (el=%s)", run_id, step_index, decision.operation, decision.element_index)

                        step_id = f"step-{step_index}"

                        # Compute bbox for cursor display
                        bbox = None
                        if decision.element_index is not None:
                            el = next((e for e in elements if e["index"] == decision.element_index), None)
                            if el:
                                bbox = el.get("bbox")

                        await emit(run_id, {
                            "type": "action_chosen",
                            "step_id": step_id,
                            "operation": decision.operation,
                            "element_index": decision.element_index,
                            "text": None,  # NEVER send text in events (may be a secret)
                            "bbox": bbox,
                        })

                        # Terminal operations
                        if decision.operation == Operation.DONE:
                            screenshot = await get_page_snapshot(browser.page)
                            final_result = {
                                "type": "task_finished",
                                "result": {
                                    "kind": "generic",
                                    "data": {"url": page_url, "steps_taken": step_index},
                                    "sources": [page_url],
                                    "message": decision.reasoning or f"Task completed in {step_index} steps.",
                                    "screenshot": screenshot,
                                },
                            }
                            break

                        if decision.operation == Operation.BLOCKED:
                            await emit(run_id, {
                                "type": "blocked",
                                "reason": decision.reasoning,
                                "options": ["retry", "cancel"],
                            })
                            cmd = await get_command(run_id, timeout=float(settings.approval_timeout_seconds))
                            if not cmd or cmd.get("cmd") != "resume":
                                break
                            continue

                        # ── Policy gate ────────────────────────────────────────────
                        el_label = ""
                        if decision.element_index is not None:
                            el_data = next((e for e in elements if e["index"] == decision.element_index), None)
                            el_label = el_data.get("label", "") if el_data else ""

                        policy_ctx = PolicyContext(
                            url=page_url,
                            page_text=page_text[:2000],
                            operation=str(decision.operation),
                            element_label=el_label,
                            element_index=decision.element_index,
                            run_id=run_id,
                            step_index=step_index,
                        )
                        policy_result = policy_eval(policy_ctx)

                        if policy_result.verdict == PolicyVerdict.BLOCK:
                            await emit(run_id, {
                                "type": "blocked",
                                "reason": policy_result.reason,
                                "options": ["cancel"],
                            })
                            run.status = "failed"
                            await db.commit()
                            break

                        if policy_result.verdict == PolicyVerdict.REQUIRE_APPROVAL:
                            screenshot = await get_page_snapshot(browser.page)
                            await emit(run_id, {
                                "type": "approval_required",
                                "approval_id": policy_result.approval_id,
                                "title": policy_result.title,
                                "summary": policy_result.summary,
                                "risk": policy_result.risk,
                                "screenshot": screenshot,
                                "timeout_seconds": settings.approval_timeout_seconds,
                            })
                            cmd = await get_command(run_id, timeout=float(settings.approval_timeout_seconds))
                            if not cmd or cmd.get("cmd") != "approve":
                                await emit(run_id, {"type": "task_failed", "message": "Approval declined or timed out."})
                                run.status = "failed"
                                await db.commit()
                                break

                        # ── Secret detection ──────────────────────────────────────
                        if decision.operation == Operation.TYPE and el_label:
                            if is_secret_field(el_label):
                                import uuid
                                secret_req = SecretRequest(
                                    secret_id=str(uuid.uuid4())[:16],
                                    title=f"Secret needed: {el_label}",
                                    fields=[SecretField(key="value", label=el_label, kind="password")],
                                )
                                await emit(run_id, {
                                    "type": "secret_required",
                                    "secret_id": secret_req.secret_id,
                                    "title": secret_req.title,
                                    "fields": [{"key": f.key, "label": f.label, "kind": f.kind} for f in secret_req.fields],
                                })
                                try:
                                    provided = await secret_broker.request(secret_req)
                                    decision.text = provided.get("value", "")
                                except asyncio.TimeoutError:
                                    await emit(run_id, {"type": "task_failed", "message": "Secret not provided in time."})
                                    run.status = "failed"
                                    await db.commit()
                                    break

                        # ── Execute ──────────────────────────────────────────────
                        await emit(run_id, {"type": "step_started", "step_id": step_id, "action": decision.reasoning})
                        start_ms = asyncio.get_event_loop().time() * 1000

                        try:
                            result_str = await asyncio.wait_for(
                                execute(browser.page, decision, elements),
                                timeout=30.0,
                            )
                            duration_ms = int(asyncio.get_event_loop().time() * 1000 - start_ms)
                            await emit(run_id, {"type": "step_finished", "step_id": step_id, "duration_ms": duration_ms})
                            step_history.append({"step": str(decision.operation), "result": result_str})
                        except Exception as e:
                            logger.warning("Step %d failed: %s", step_index, e)
                            await emit(run_id, {"type": "step_failed", "step_id": step_id, "reason": str(e)})
                            step_history.append({"step": str(decision.operation), "result": f"Error: {e}"})

                        step_index += 1

                        # Check time budget
                        async with AsyncSessionLocal() as check_db:
                            from sqlalchemy import select
                            from app.db.models import Run as RunModel
                            check = await check_db.execute(select(RunModel).where(RunModel.id == run_id))
                            check_run = check.scalar_one_or_none()
                            if check_run:
                                elapsed = (datetime.now(timezone.utc) - check_run.started_at).total_seconds()
                                if elapsed > settings.max_run_seconds:
                                    logger.warning("Run %s exceeded time budget (%ds)", run_id, settings.max_run_seconds)
                                    break

                    # Task outcome
                    if final_result:
                        await emit(run_id, final_result)
                        run.status = "done"
                        run.result_json = str(final_result.get("result", {}))

                        msg_result = await db.execute(select(Message).where(Message.id == assistant_msg_id))
                        msg = msg_result.scalar_one_or_none()
                        if msg:
                            msg.text = final_result["result"].get("message", "Task complete.")
                    else:
                        await emit(run_id, {"type": "task_failed", "message": "Agent stopped without completing the task."})
                        if run.status not in ("cancelled", "failed"):
                            run.status = "failed"

                    await db.commit()
                    secret_broker.clear()

            except Exception as e:
                logger.exception("Browser session error for run %s: %s", run_id, e)
                await emit(run_id, {"type": "task_failed", "message": str(e)})
                run.status = "failed"
                await db.commit()

    # Signal WS to close
    q = RUN_QUEUES.get(run_id)
    if q:
        try:
            await q.put(None)  # type: ignore[arg-type]
        except Exception:
            pass

    _seq_counters.pop(run_id, None)
    cleanup_queues(run_id)
    logger.info("Run %s complete", run_id)
