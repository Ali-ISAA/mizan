from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# NullPool engine for Celery workers: each asyncio.run() call creates a fresh
# event loop, which is incompatible with asyncpg's pooled connections that are
# bound to the loop they were first acquired on. NullPool opens and closes a
# connection per session, so there is no cross-loop pool state.
_worker_engine = create_async_engine(
    settings.database_url,
    poolclass=NullPool,
    echo=False,
)
WorkerAsyncSessionLocal = async_sessionmaker(
    _worker_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
