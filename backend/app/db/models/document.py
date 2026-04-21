import uuid
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MizanDocument(Base):
    """A document uploaded to a Mizan project. Role identifies its purpose."""

    __tablename__ = "mizan_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    # "requirement" = Doc A (policies/RFP), "compliance" = Doc B (response/org doc)
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str | None] = mapped_column(String(20))
    file_size: Mapped[int | None] = mapped_column(BigInteger)
    file_url: Mapped[str | None] = mapped_column(Text)
    file_hash: Mapped[str | None] = mapped_column(String(64))
    processing_status: Mapped[str] = mapped_column(String(30), default="pending")
    # pending | processing | completed | failed
    noesia_document_id: Mapped[str | None] = mapped_column(String(255))
    noesia_chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    classification: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    file_properties: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    text_output: Mapped[str | None] = mapped_column(Text)
    ai_summary: Mapped[str | None] = mapped_column(Text)
    page_count: Mapped[int | None] = mapped_column(Integer)
    word_count: Mapped[int | None] = mapped_column(Integer)
    indexed_at: Mapped[datetime | None] = mapped_column()
    deleted_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    base_document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("base_documents.id"))
    chunks: Mapped[list["MizanDocumentChunk"]] = relationship("MizanDocumentChunk", back_populates="mizan_document", cascade="all, delete-orphan")  # type: ignore[name-defined]

    project: Mapped["Project"] = relationship("Project", back_populates="documents")  # type: ignore[name-defined]
