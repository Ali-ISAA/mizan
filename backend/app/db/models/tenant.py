import uuid
from datetime import datetime

from sqlalchemy import Boolean, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    plan: Mapped[str] = mapped_column(String(50), default="free")
    noesia_api_url: Mapped[str | None] = mapped_column(String(500))
    noesia_token: Mapped[str | None] = mapped_column(Text)
    vector_store_type: Mapped[str] = mapped_column(String(50), default="qdrant")
    vector_store_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    max_users: Mapped[int] = mapped_column(Integer, default=10)
    max_storage_gb: Mapped[int] = mapped_column(Integer, default=10)
    max_documents: Mapped[int] = mapped_column(Integer, default=1000)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
