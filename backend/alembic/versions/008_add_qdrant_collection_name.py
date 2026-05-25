"""Add qdrant_collection_name to mizan_documents.

Revision ID: 008
Revises: 007
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mizan_documents",
        sa.Column("qdrant_collection_name", sa.String(200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("mizan_documents", "qdrant_collection_name")
