import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MizanDocumentArticle(Base):
    __tablename__ = "mizan_document_articles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mizan_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mizan_documents.id", ondelete="CASCADE"), nullable=False
    )
    article_index: Mapped[int] = mapped_column(Integer, nullable=False)
    article_number: Mapped[str] = mapped_column(String(500), nullable=False)
    article_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
