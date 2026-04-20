import uuid
from datetime import datetime

from sqlalchemy import Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

DOC_TYPES = ("GDPR", "SOX", "HIPAA", "ISO 27001", "CCPA", "PCI DSS", "Others")


class BaseDocument(Base):
    """Admin-uploaded reference/compliance standard document."""

    __tablename__ = "base_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(50), nullable=False)  # GDPR | SOX | HIPAA | ISO 27001 | CCPA | PCI DSS | Others
    processing_status: Mapped[str] = mapped_column(String(30), default="pending")  # pending | processing | completed | failed
    noesia_document_id: Mapped[str | None] = mapped_column(String(255))
    noesia_collection_id: Mapped[str | None] = mapped_column(String(255))
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    file_path: Mapped[str | None] = mapped_column(Text)  # path on disk
    file_size: Mapped[int | None] = mapped_column(Integer)
    uploaded_by: Mapped[str] = mapped_column(String(100), default="superadmin")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
