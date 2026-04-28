"""Add progress tracking columns to compliance_comparison.

Revision ID: 002
Revises: 001
Create Date: 2026-04-28 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "compliance_comparisons",
        sa.Column("current_chunk", sa.Integer, nullable=False, server_default="0"),
    )
    op.add_column(
        "compliance_comparisons",
        sa.Column("total_chunks", sa.Integer, nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("compliance_comparisons", "total_chunks")
    op.drop_column("compliance_comparisons", "current_chunk")
