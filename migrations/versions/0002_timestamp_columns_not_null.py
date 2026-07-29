"""align timestamp nullability with the ORM models

Revision ID: 0002_timestamp_columns_not_null
Revises: 0001_initial_schema
Create Date: 2026-07-29
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_timestamp_columns_not_null"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None

TIMESTAMP_COLUMNS = {
    "agent_sessions": ("created_at",),
    "game_analyses": ("created_at",),
    "move_analyses": ("created_at",),
    "training_recommendations": ("created_at",),
    "user_profiles": ("created_at", "updated_at"),
    "weakness_profiles": ("created_at", "updated_at"),
}


def upgrade() -> None:
    for table_name, columns in TIMESTAMP_COLUMNS.items():
        for column_name in columns:
            op.execute(
                sa.text(
                    f'UPDATE "{table_name}" '
                    f'SET "{column_name}" = now() '
                    f'WHERE "{column_name}" IS NULL'
                )
            )
            op.alter_column(
                table_name,
                column_name,
                existing_type=sa.DateTime(timezone=True),
                nullable=False,
            )


def downgrade() -> None:
    for table_name, columns in TIMESTAMP_COLUMNS.items():
        for column_name in columns:
            op.alter_column(
                table_name,
                column_name,
                existing_type=sa.DateTime(timezone=True),
                nullable=True,
            )
