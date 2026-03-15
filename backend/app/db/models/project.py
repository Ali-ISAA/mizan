import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Project(Base):
    """A compliance analysis project — pairs a requirements doc with a compliance doc."""

    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # noesia collection used for both docs in this project
    noesia_collection_name: Mapped[str | None] = mapped_column(String(255))
    noesia_collection_id: Mapped[str | None] = mapped_column(String(255))
    # overall analysis status
    status: Mapped[str] = mapped_column(String(30), default="pending")
    # pending | processing | complete | failed
    overall_score: Mapped[float | None] = mapped_column(Float)  # 0.0 – 100.0
    requirements_count: Mapped[int] = mapped_column(Integer, default=0)
    met_count: Mapped[int] = mapped_column(Integer, default=0)
    partial_count: Mapped[int] = mapped_column(Integer, default=0)
    not_met_count: Mapped[int] = mapped_column(Integer, default=0)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    deleted_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    documents: Mapped[list["MizanDocument"]] = relationship(  # type: ignore[name-defined]
        "MizanDocument", back_populates="project", cascade="all, delete-orphan", passive_deletes=True
    )
    analysis_result: Mapped["AnalysisResult | None"] = relationship(  # type: ignore[name-defined]
        "AnalysisResult", back_populates="project", uselist=False, cascade="all, delete-orphan", passive_deletes=True
    )
