import uuid
from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ComplianceFinding(Base):
    """Individual compliance findings from comparison."""
    __tablename__ = "compliance_findings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    comparison_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("compliance_comparisons.id", ondelete="CASCADE"))

    doc_a_section: Mapped[str] = mapped_column(String(500))
    doc_b_section: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(30))
    severity: Mapped[str] = mapped_column(String(30))
    issue: Mapped[str] = mapped_column(Text)
    recommendation: Mapped[str] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    comparison: Mapped["ComplianceComparison"] = relationship(back_populates="findings")
