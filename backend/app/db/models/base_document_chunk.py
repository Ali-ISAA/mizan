import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BaseDocumentChunk(Base):
    """Chunks extracted from base documents by Noesia."""

    __tablename__ = "base_document_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    base_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("base_documents.id", ondelete="CASCADE"), nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)  # 0-based index
    text: Mapped[str] = mapped_column(Text, nullable=False)  # chunk content

    # Metadata from Noesia
    section_header: Mapped[str | None] = mapped_column(String(500))  # section title if available
    section_level: Mapped[int | None] = mapped_column(Integer)  # hierarchy level (1, 2, 3...)
    document_name: Mapped[str | None] = mapped_column(String(500))  # original filename in Noesia

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
