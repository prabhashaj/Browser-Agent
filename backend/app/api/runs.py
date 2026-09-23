"""backend/app/api/runs.py — Run lifecycle: create, get snapshot, cancel."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.config import get_settings
from app.db.models import Message, Run, Thread, User
from app.db.session import get_db

router = APIRouter(prefix="/api/runs", tags=["runs"])
logger = logging.getLogger(__name__)


class CreateRunBody(BaseModel):
    thread_id: str
    goal: str


class RunOut(BaseModel):
    id: str
    thread_id: str
    goal: str
    status: str
    started_at: datetime
    finished_at: datetime | None


@router.post("", response_model=RunOut, status_code=status.HTTP_201_CREATED)
async def create_run(
    body: CreateRunBody,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()

    if settings.kill_switch:
        raise HTTPException(status_code=503, detail="Agent is temporarily disabled")

    # Verify thread belongs to user
    thread_result = await db.execute(select(Thread).where(Thread.id == body.thread_id, Thread.user_id == user.id))
    thread = thread_result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Check concurrent run limit
    running_result = await db.execute(
        select(Run).where(Run.user_id == user.id, Run.status.in_(["pending", "running", "waiting"]))
    )
    running = running_result.scalars().all()
    if len(running) >= settings.max_concurrent_runs:
        raise HTTPException(
            status_code=429,
            detail=f"You already have {settings.max_concurrent_runs} active runs. Please wait for one to finish.",
        )

    run = Run(thread_id=body.thread_id, user_id=user.id, goal=body.goal, status="pending")
    db.add(run)
    await db.commit()
    await db.refresh(run)

    # Add a placeholder assistant message linked to this run
    assistant_msg = Message(thread_id=body.thread_id, role="assistant", text="", run_id=run.id)
    db.add(assistant_msg)
    await db.commit()

    # Start the agent loop in the background
    background_tasks.add_task(_start_agent, run.id, user.id, body.goal, assistant_msg.id)

    return RunOut(id=run.id, thread_id=run.thread_id, goal=run.goal, status=run.status, started_at=run.started_at, finished_at=run.finished_at)


@router.get("/{run_id}", response_model=RunOut)
async def get_run(
    run_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Run).where(Run.id == run_id, Run.user_id == user.id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunOut(id=run.id, thread_id=run.thread_id, goal=run.goal, status=run.status, started_at=run.started_at, finished_at=run.finished_at)


@router.delete("/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_run(
    run_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Run).where(Run.id == run_id, Run.user_id == user.id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    run.status = "cancelled"
    await db.commit()

    # Signal the event queue to close
    from app.api.ws import RUN_QUEUES
    q = RUN_QUEUES.get(run_id)
    if q:
        await q.put(None)  # sentinel


async def _start_agent(run_id: str, user_id: str, goal: str, assistant_msg_id: str) -> None:
    """Background task: import and run the orchestrator."""
    try:
        from app.agent.orchestrator import run_agent
        await run_agent(run_id=run_id, user_id=user_id, goal=goal, assistant_msg_id=assistant_msg_id)
    except Exception as e:
        logger.exception("Agent crashed for run %s: %s", run_id, e)
        # Emit a task_failed event
        from app.api.ws import RUN_QUEUES
        q = RUN_QUEUES.get(run_id)
        if q:
            try:
                await q.put({"type": "task_failed", "run_id": run_id, "seq": 0, "ts": datetime.utcnow().isoformat(), "message": str(e)})
                await asyncio.sleep(0.5)
                await q.put(None)
            except Exception:
                pass
