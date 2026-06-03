import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AnalysisResult(Base):
    """Top-level result for a project's compliance analysis."""

    __tablename__ = "analysis_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    overall_score: Mapped[float | None] = mapped_column(Float)
    requirements_count: Mapped[int] = mapped_column(Integer, default=0)
    met_count: Mapped[int] = mapped_column(Integer, default=0)
    partial_count: Mapped[int] = mapped_column(Integer, default=0)
    not_met_count: Mapped[int] = mapped_column(Integer, default=0)
    critical_gaps: Mapped[int] = mapped_column(Integer, default=0)
    major_gaps: Mapped[int] = mapped_column(Integer, default=0)
    minor_gaps: Mapped[int] = mapped_column(Integer, default=0)
    executive_summary: Mapped[str | None] = mapped_column(Text)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    analyzed_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    requirements: Mapped[list["RequirementItem"]] = relationship(
        "RequirementItem", back_populates="analysis_result", cascade="all, delete-orphan", passive_deletes=True
    )
    gaps: Mapped[list["GapItem"]] = relationship(
        "GapItem", back_populates="analysis_result", cascade="all, delete-orphan", passive_deletes=True
    )


class RequirementItem(Base):
    """A single requirement extracted from Document A."""

    __tablename__ = "requirement_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_result_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analysis_results.id", ondelete="CASCADE")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    requirement_text: Mapped[str] = mapped_column(Text, nullable=False)
    section_ref: Mapped[str | None] = mapped_column(String(255))  # e.g. "Section 3.2", "Article 5"
    compliance_status: Mapped[str] = mapped_column(String(30), default="not_met")
    # met | partial | not_met
    confidence_score: Mapped[float | None] = mapped_column(Float)  # 0.0 – 1.0
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    analysis_result: Mapped["AnalysisResult"] = relationship("AnalysisResult", back_populates="requirements")
    mappings: Mapped[list["ComplianceMapping"]] = relationship(
        "ComplianceMapping", back_populates="requirement", cascade="all, delete-orphan", passive_deletes=True
    )


class ComplianceMapping(Base):
    """Maps a requirement to the clause in Document B that addresses it."""

    __tablename__ = "compliance_mappings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirement_items.id", ondelete="CASCADE")
    )
    matched_clause_text: Mapped[str | None] = mapped_column(Text)
    doc_b_section_ref: Mapped[str | None] = mapped_column(String(255))
    match_score: Mapped[float | None] = mapped_column(Float)  # semantic similarity 0.0 – 1.0
    ai_commentary: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    requirement: Mapped["RequirementItem"] = relationship("RequirementItem", back_populates="mappings")


class GapItem(Base):
    """A compliance gap — a requirement not met or only partially met."""

    __tablename__ = "gap_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analysis_result_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("analysis_results.id", ondelete="CASCADE")
    )
    requirement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirement_items.id", ondelete="SET NULL")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    gap_description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="major")  # critical | major | minor
    recommendation: Mapped[str | None] = mapped_column(Text)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    analysis_result: Mapped["AnalysisResult"] = relationship("AnalysisResult", back_populates="gaps")
