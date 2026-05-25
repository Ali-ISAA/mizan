import uuid
from datetime import datetime
from sqlalchemy import Integer, String, Text, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ComplianceReport(Base):
    """Aggregated compliance findings for a comparison."""
    __tablename__ = "compliance_reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    comparison_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("compliance_comparisons.id", ondelete="CASCADE"), unique=True)

    compliance_score: Mapped[int] = mapped_column(Integer, default=0)
    total_findings: Mapped[int] = mapped_column(Integer, default=0)
    critical_count: Mapped[int] = mapped_column(Integer, default=0)
    medium_count: Mapped[int] = mapped_column(Integer, default=0)
    low_count: Mapped[int] = mapped_column(Integer, default=0)

    missing_in_doc_a: Mapped[list] = mapped_column(JSONB, default=list)
    missing_in_doc_b: Mapped[list] = mapped_column(JSONB, default=list)
    summary: Mapped[str] = mapped_column(Text, default="")
    raw_response: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Extended fields from regulation-first analysis
    regulation_coverage_score: Mapped[float | None] = mapped_column(Integer, nullable=True)
    fully_covered_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    partially_covered_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    executive_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    risk_assessment: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    comparison: Mapped["ComplianceComparison"] = relationship(back_populates="report")
