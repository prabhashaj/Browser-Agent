"""backend/app/db/session.py — Async SQLAlchemy engine and session factory."""
from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings


def _make_engine():
    settings = get_settings()
    url = settings.database_url
    # SQLite needs check_same_thread=False and NullPool for async
    if url.startswith("sqlite"):
        from sqlalchemy.pool import NullPool
        return create_async_engine(url, echo=False, poolclass=NullPool)
    return create_async_engine(url, echo=False, pool_pre_ping=True, pool_size=10, max_overflow=20)


engine = _make_engine()
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yields an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
