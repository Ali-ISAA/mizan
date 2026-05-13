"""Add article extraction tables and status columns.

Revision ID: 006
Revises: 005
Create Date: 2026-05-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add articles_status and articles_error to base_documents
    op.add_column("base_documents", sa.Column("articles_status", sa.String(20), nullable=True))
    op.add_column("base_documents", sa.Column("articles_error", sa.Text(), nullable=True))

    # Add articles_status and articles_error to mizan_documents
    op.add_column("mizan_documents", sa.Column("articles_status", sa.String(20), nullable=True))
    op.add_column("mizan_documents", sa.Column("articles_error", sa.Text(), nullable=True))

    # Create base_document_articles
    op.create_table(
        "base_document_articles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("base_document_id", UUID(as_uuid=True), sa.ForeignKey("base_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("article_index", sa.Integer(), nullable=False),
        sa.Column("article_number", sa.String(50), nullable=False),
        sa.Column("article_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_base_doc_articles_doc_index", "base_document_articles", ["base_document_id", "article_index"])

    # Create mizan_document_articles
    op.create_table(
        "mizan_document_articles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("mizan_document_id", UUID(as_uuid=True), sa.ForeignKey("mizan_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("article_index", sa.Integer(), nullable=False),
        sa.Column("article_number", sa.String(50), nullable=False),
        sa.Column("article_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_mizan_doc_articles_doc_index", "mizan_document_articles", ["mizan_document_id", "article_index"])


def downgrade() -> None:
    op.drop_table("mizan_document_articles")
    op.drop_table("base_document_articles")
    op.drop_column("mizan_documents", "articles_error")
    op.drop_column("mizan_documents", "articles_status")
    op.drop_column("base_documents", "articles_error")
    op.drop_column("base_documents", "articles_status")
