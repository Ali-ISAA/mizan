import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MizanDocumentChunk(Base):
    """Chunks extracted from a MizanDocument via Noesia."""

    __tablename__ = "mizan_document_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mizan_document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("mizan_documents.id", ondelete="CASCADE"))
    chunk_index: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    section_header: Mapped[str | None] = mapped_column(String(500))
    section_level: Mapped[int | None] = mapped_column(Integer)
    document_name: Mapped[str] = mapped_column(String(500))
    metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    mizan_document: Mapped["MizanDocument"] = relationship("MizanDocument", back_populates="chunks")
