"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-06-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lichess_username", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_user_profiles_lichess_username",
        "user_profiles",
        ["lichess_username"],
        unique=True,
    )

    op.create_table(
        "game_analyses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_profiles.id"), nullable=False),
        sa.Column("lichess_game_id", sa.String(length=32)),
        sa.Column("pgn", sa.Text(), nullable=False),
        sa.Column("opponent", sa.String(length=100)),
        sa.Column("color_played", sa.String(length=10)),
        sa.Column("result", sa.String(length=20)),
        sa.Column("opening_name", sa.String(length=255)),
        sa.Column("total_moves", sa.Integer(), nullable=False),
        sa.Column("analysis_summary", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "lichess_game_id", name="uq_user_game_analysis"),
    )
    op.create_index("ix_game_analyses_user_id", "game_analyses", ["user_id"])
    op.create_index(
        "ix_game_analyses_lichess_game_id",
        "game_analyses",
        ["lichess_game_id"],
    )

    op.create_table(
        "weakness_profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_profiles.id"), nullable=False),
        sa.Column("games_analyzed", sa.Integer(), nullable=False),
        sa.Column("main_weakness", sa.String(length=50), nullable=False),
        sa.Column("opening_score", sa.Float(), nullable=False),
        sa.Column("middlegame_score", sa.Float(), nullable=False),
        sa.Column("endgame_score", sa.Float(), nullable=False),
        sa.Column("tactical_errors", sa.Integer(), nullable=False),
        sa.Column("strategic_errors", sa.Integer(), nullable=False),
        sa.Column("blunders_total", sa.Integer(), nullable=False),
        sa.Column("mistakes_total", sa.Integer(), nullable=False),
        sa.Column("inaccuracies_total", sa.Integer(), nullable=False),
        sa.Column("profile_data", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_weakness_profiles_user_id", "weakness_profiles", ["user_id"])
    op.create_index(
        "ix_weakness_profiles_main_weakness",
        "weakness_profiles",
        ["main_weakness"],
    )

    op.create_table(
        "move_analyses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "game_analysis_id",
            sa.Integer(),
            sa.ForeignKey("game_analyses.id"),
            nullable=False,
        ),
        sa.Column("move_number", sa.Integer(), nullable=False),
        sa.Column("move_uci", sa.String(length=16), nullable=False),
        sa.Column("move_san", sa.String(length=32), nullable=False),
        sa.Column("phase", sa.String(length=20), nullable=False),
        sa.Column("evaluation_before", sa.Float()),
        sa.Column("evaluation_after", sa.Float()),
        sa.Column("cpl", sa.Float(), nullable=False),
        sa.Column("classification", sa.String(length=20), nullable=False),
        sa.Column("fen_before", sa.Text(), nullable=False),
        sa.Column("fen_after", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_move_analyses_game_analysis_id", "move_analyses", ["game_analysis_id"])
    op.create_index("ix_move_analyses_phase", "move_analyses", ["phase"])
    op.create_index("ix_move_analyses_classification", "move_analyses", ["classification"])

    op.create_table(
        "training_recommendations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_profiles.id"), nullable=False),
        sa.Column("game_analysis_id", sa.Integer(), sa.ForeignKey("game_analyses.id")),
        sa.Column("weakness_profile_id", sa.Integer(), sa.ForeignKey("weakness_profiles.id")),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("priority", sa.String(length=100), nullable=False),
        sa.Column("source_type", sa.String(length=50), nullable=False),
        sa.Column("rag_sources", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_training_recommendations_user_id",
        "training_recommendations",
        ["user_id"],
    )

    op.create_table(
        "agent_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user_profiles.id")),
        sa.Column("input_message", sa.Text(), nullable=False),
        sa.Column("output_message", sa.Text(), nullable=False),
        sa.Column("tools_used", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_agent_sessions_user_id", "agent_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_sessions_user_id", table_name="agent_sessions")
    op.drop_table("agent_sessions")

    op.drop_index(
        "ix_training_recommendations_user_id",
        table_name="training_recommendations",
    )
    op.drop_table("training_recommendations")

    op.drop_index("ix_move_analyses_classification", table_name="move_analyses")
    op.drop_index("ix_move_analyses_phase", table_name="move_analyses")
    op.drop_index("ix_move_analyses_game_analysis_id", table_name="move_analyses")
    op.drop_table("move_analyses")

    op.drop_index("ix_weakness_profiles_main_weakness", table_name="weakness_profiles")
    op.drop_index("ix_weakness_profiles_user_id", table_name="weakness_profiles")
    op.drop_table("weakness_profiles")

    op.drop_index("ix_game_analyses_lichess_game_id", table_name="game_analyses")
    op.drop_index("ix_game_analyses_user_id", table_name="game_analyses")
    op.drop_table("game_analyses")

    op.drop_index("ix_user_profiles_lichess_username", table_name="user_profiles")
    op.drop_table("user_profiles")
