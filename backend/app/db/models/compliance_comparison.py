import uuid
from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ComplianceComparison(Base):
    """Job tracking for document comparison (like Noesia jobs)."""

    __tablename__ = "compliance_comparisons"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    mizan_document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("mizan_documents.id", ondelete="CASCADE"))
    base_document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("base_documents.id", ondelete="CASCADE"))

    status: Mapped[str] = mapped_column(String(30), default="pending")  # pending|processing|completed|failed
    error_message: Mapped[str | None] = mapped_column(Text)

    started_at: Mapped[datetime | None] = mapped_column()
    completed_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    # Relationships
    mizan_document: Mapped["MizanDocument"] = relationship(back_populates="comparisons")
    base_document: Mapped["BaseDocument"] = relationship(back_populates="comparisons")
    report: Mapped["ComplianceReport"] = relationship(back_populates="comparison", cascade="all, delete-orphan", uselist=False)
    findings: Mapped[list["ComplianceFinding"]] = relationship(back_populates="comparison", cascade="all, delete-orphan")
