"""backend/app/api/threads.py — Thread and message CRUD."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.auth import get_current_user
from app.db.models import Message, Thread, User
from app.db.session import get_db

router = APIRouter(prefix="/api/threads", tags=["threads"])


class MessageOut(BaseModel):
    id: str
    role: str
    text: str
    result_json: str | None
    run_id: str | None
    created_at: datetime


class ThreadOut(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int


class ThreadDetailOut(ThreadOut):
    messages: list[MessageOut]


class CreateThreadBody(BaseModel):
    title: str = "New conversation"


class RenameThreadBody(BaseModel):
    title: str


@router.get("", response_model=list[ThreadOut])
async def list_threads(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Thread)
        .where(Thread.user_id == user.id)
        .order_by(Thread.updated_at.desc())
    )
    threads = result.scalars().all()
    # Count messages per thread
    out = []
    for t in threads:
        msgs = await db.execute(select(Message).where(Message.thread_id == t.id))
        count = len(msgs.scalars().all())
        out.append(ThreadOut(id=t.id, title=t.title, created_at=t.created_at, updated_at=t.updated_at, message_count=count))
    return out


@router.post("", response_model=ThreadDetailOut, status_code=status.HTTP_201_CREATED)
async def create_thread(
    body: CreateThreadBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    thread = Thread(user_id=user.id, title=body.title)
    db.add(thread)
    await db.commit()
    await db.refresh(thread)
    return ThreadDetailOut(id=thread.id, title=thread.title, created_at=thread.created_at, updated_at=thread.updated_at, message_count=0, messages=[])


@router.get("/{thread_id}", response_model=ThreadDetailOut)
async def get_thread(
    thread_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Thread)
        .where(Thread.id == thread_id, Thread.user_id == user.id)
        .options(selectinload(Thread.messages))
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    messages = [
        MessageOut(id=m.id, role=m.role, text=m.text, result_json=m.result_json, run_id=m.run_id, created_at=m.created_at)
        for m in thread.messages
    ]
    return ThreadDetailOut(id=thread.id, title=thread.title, created_at=thread.created_at, updated_at=thread.updated_at, message_count=len(messages), messages=messages)


@router.patch("/{thread_id}", response_model=ThreadOut)
async def rename_thread(
    thread_id: str,
    body: RenameThreadBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Thread).where(Thread.id == thread_id, Thread.user_id == user.id))
    thread = result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    thread.title = body.title[:500]
    await db.commit()
    await db.refresh(thread)
    msgs = await db.execute(select(Message).where(Message.thread_id == thread.id))
    count = len(msgs.scalars().all())
    return ThreadOut(id=thread.id, title=thread.title, created_at=thread.created_at, updated_at=thread.updated_at, message_count=count)


@router.delete("/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_thread(
    thread_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Thread).where(Thread.id == thread_id, Thread.user_id == user.id))
    thread = result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    await db.delete(thread)
    await db.commit()
