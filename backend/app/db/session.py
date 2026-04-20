from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# For Celery worker: function to create a fresh sessionmaker in the current event loop
def WorkerAsyncSessionLocal():
    """Create a fresh async sessionmaker for Celery worker tasks.

    Must be called within an asyncio context (inside asyncio.run()).
    Returns an async_sessionmaker that can be used with 'async with'.
    """
    worker_engine = create_async_engine(settings.database_url, echo=False)
    return async_sessionmaker(
        worker_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
