"""Extend activity_logs with audit columns.

Revision ID: 005
Revises: 004
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("activity_logs", sa.Column("severity",    sa.String(20),  nullable=False, server_default="info"))
    op.add_column("activity_logs", sa.Column("title",       sa.String(255), nullable=False, server_default=""))
    op.add_column("activity_logs", sa.Column("description", sa.Text(),      nullable=True))
    op.add_column("activity_logs", sa.Column("actor_email", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("activity_logs", "actor_email")
    op.drop_column("activity_logs", "description")
    op.drop_column("activity_logs", "title")
    op.drop_column("activity_logs", "severity")
