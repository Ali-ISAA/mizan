from celery import Celery
from app.config import settings

celery_app = Celery(
    "mizan",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.tasks.processing",
        "app.tasks.analysis",
        "app.tasks.process_base_document",
        "app.tasks.process_user_document",
        "app.tasks.compare_documents",
        "app.tasks.extract_articles",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)
