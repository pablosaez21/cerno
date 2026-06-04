from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lichess_username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    game_analyses: Mapped[list["GameAnalysis"]] = relationship(back_populates="user")
    weakness_profiles: Mapped[list["WeaknessProfile"]] = relationship(back_populates="user")
    training_recommendations: Mapped[list["TrainingRecommendation"]] = relationship(
        back_populates="user"
    )
    agent_sessions: Mapped[list["AgentSession"]] = relationship(back_populates="user")


class GameAnalysis(Base, TimestampMixin):
    __tablename__ = "game_analyses"
    __table_args__ = (
        UniqueConstraint("user_id", "lichess_game_id", name="uq_user_game_analysis"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user_profiles.id"), index=True)
    lichess_game_id: Mapped[str | None] = mapped_column(String(32), index=True)
    pgn: Mapped[str] = mapped_column(Text)
    opponent: Mapped[str | None] = mapped_column(String(100))
    color_played: Mapped[str | None] = mapped_column(String(10))
    result: Mapped[str | None] = mapped_column(String(20))
    opening_name: Mapped[str | None] = mapped_column(String(255))
    total_moves: Mapped[int] = mapped_column(Integer, default=0)
    analysis_summary: Mapped[dict] = mapped_column(JSONB)

    user: Mapped[UserProfile] = relationship(back_populates="game_analyses")
    move_analyses: Mapped[list["MoveAnalysis"]] = relationship(
        back_populates="game_analysis",
        cascade="all, delete-orphan",
    )
    training_recommendations: Mapped[list["TrainingRecommendation"]] = relationship(
        back_populates="game_analysis"
    )


class MoveAnalysis(Base, TimestampMixin):
    __tablename__ = "move_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    game_analysis_id: Mapped[int] = mapped_column(
        ForeignKey("game_analyses.id"),
        index=True,
    )
    move_number: Mapped[int] = mapped_column(Integer)
    move_uci: Mapped[str] = mapped_column(String(16))
    move_san: Mapped[str] = mapped_column(String(32))
    phase: Mapped[str] = mapped_column(String(20), index=True)
    evaluation_before: Mapped[float | None] = mapped_column(Float)
    evaluation_after: Mapped[float | None] = mapped_column(Float)
    cpl: Mapped[float] = mapped_column(Float)
    classification: Mapped[str] = mapped_column(String(20), index=True)
    fen_before: Mapped[str] = mapped_column(Text)
    fen_after: Mapped[str] = mapped_column(Text)

    game_analysis: Mapped[GameAnalysis] = relationship(back_populates="move_analyses")


class WeaknessProfile(Base):
    __tablename__ = "weakness_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user_profiles.id"), index=True)
    games_analyzed: Mapped[int] = mapped_column(Integer)
    main_weakness: Mapped[str] = mapped_column(String(50), index=True)
    opening_score: Mapped[float] = mapped_column(Float, default=0)
    middlegame_score: Mapped[float] = mapped_column(Float, default=0)
    endgame_score: Mapped[float] = mapped_column(Float, default=0)
    tactical_errors: Mapped[int] = mapped_column(Integer, default=0)
    strategic_errors: Mapped[int] = mapped_column(Integer, default=0)
    blunders_total: Mapped[int] = mapped_column(Integer, default=0)
    mistakes_total: Mapped[int] = mapped_column(Integer, default=0)
    inaccuracies_total: Mapped[int] = mapped_column(Integer, default=0)
    profile_data: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped[UserProfile] = relationship(back_populates="weakness_profiles")
    training_recommendations: Mapped[list["TrainingRecommendation"]] = relationship(
        back_populates="weakness_profile"
    )


class TrainingRecommendation(Base, TimestampMixin):
    __tablename__ = "training_recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user_profiles.id"), index=True)
    game_analysis_id: Mapped[int | None] = mapped_column(ForeignKey("game_analyses.id"))
    weakness_profile_id: Mapped[int | None] = mapped_column(
        ForeignKey("weakness_profiles.id")
    )
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(100))
    source_type: Mapped[str] = mapped_column(String(50))
    rag_sources: Mapped[list] = mapped_column(JSONB)

    user: Mapped[UserProfile] = relationship(back_populates="training_recommendations")
    game_analysis: Mapped[GameAnalysis | None] = relationship(
        back_populates="training_recommendations"
    )
    weakness_profile: Mapped[WeaknessProfile | None] = relationship(
        back_populates="training_recommendations"
    )


class AgentSession(Base, TimestampMixin):
    __tablename__ = "agent_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("user_profiles.id"), index=True)
    input_message: Mapped[str] = mapped_column(Text)
    output_message: Mapped[str] = mapped_column(Text)
    tools_used: Mapped[list] = mapped_column(JSONB)

    user: Mapped[UserProfile | None] = relationship(back_populates="agent_sessions")
