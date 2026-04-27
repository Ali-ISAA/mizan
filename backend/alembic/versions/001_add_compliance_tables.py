"""Add compliance comparison tables.

Revision ID: 001
Revises:
Create Date: 2026-04-27 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "compliance_comparisons",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("mizan_document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("base_document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("started_at", sa.DateTime, nullable=True),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["mizan_document_id"], ["mizan_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["base_document_id"], ["base_documents.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "compliance_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, primary_key=True),
        sa.Column("comparison_id", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("compliance_score", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_findings", sa.Integer, nullable=False, server_default="0"),
        sa.Column("critical_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("medium_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("low_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("missing_in_doc_a", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("missing_in_doc_b", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("summary", sa.Text, nullable=False, server_default=""),
        sa.Column("raw_response", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(["comparison_id"], ["compliance_comparisons.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "compliance_findings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, primary_key=True),
        sa.Column("comparison_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("doc_a_section", sa.String(500), nullable=False),
        sa.Column("doc_b_section", sa.String(500), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("severity", sa.String(30), nullable=False),
        sa.Column("issue", sa.Text, nullable=False),
        sa.Column("recommendation", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["comparison_id"], ["compliance_comparisons.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("compliance_findings")
    op.drop_table("compliance_reports")
    op.drop_table("compliance_comparisons")
