from __future__ import annotations

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import (
    GameAnalysis,
    MoveAnalysis,
    TrainingRecommendation,
    UserProfile,
    WeaknessProfile,
)
from app.db.repositories.analyses import (
    get_user_analyses,
    save_critical_moves,
    save_game_analysis,
)
from app.db.repositories.recommendations import (
    get_user_recommendations,
    save_training_recommendation,
)
from app.db.repositories.users import get_or_create_user, get_user_by_username
from app.db.repositories.weaknesses import (
    get_user_weakness_profile,
    upsert_weakness_profile,
)
from app.db.session import Base
from app.schemas.game import Game, Player
from app.services.coach import AnalyzedPlayerGame, persist_coach_result

pytestmark = [pytest.mark.integration, pytest.mark.postgres, pytest.mark.slow]

EXPECTED_TABLES = {
    "alembic_version",
    "agent_sessions",
    "game_analyses",
    "move_analyses",
    "training_recommendations",
    "user_profiles",
    "weakness_profiles",
}


def make_game(game_id: str = "integration-game") -> Game:
    return Game(
        id=game_id,
        speed="rapid",
        rated=True,
        winner="white",
        status="mate",
        white=Player(username="IntegrationUser", rating=1800),
        black=Player(username="Opponent", rating=1775),
        moves="e4 e5 Nf3 Nc6",
        pgn=(
            '[Event "Integration"]\n[Opening "King Pawn Game"]\n\n1. e4 e5 2. Nf3 Nc6 *'
        ),
    )


def make_analysis(*, total_moves: int = 4, cpl: int = 125) -> dict:
    critical_move = {
        "move_number": 2,
        "move_uci": "g1f3",
        "move_san": "Nf3",
        "mover_color": "white",
        "phase": "opening",
        "evaluation_before": 0.2,
        "evaluation_after": -1.05,
        "cpl": cpl,
        "classification": "mistake",
        "fen_before": "fen-before",
        "fen_after": "fen-after",
    }
    return {
        "game_id": "integration-game",
        "total_moves": total_moves,
        "summary": {
            "opening": {
                "avg_cpl": 31.2,
                "inaccuracies": 0,
                "mistakes": 1,
                "blunders": 0,
            }
        },
        "critical_moments": [critical_move],
        "moves": [critical_move],
    }


def make_weakness_profile(*, games_analyzed: int = 1) -> dict:
    return {
        "games_analyzed": games_analyzed,
        "main_weakness": "opening",
        "secondary_weakness": None,
        "phase_stats": {
            "opening": {
                "moves": 2,
                "avg_cpl": 62.5,
                "inaccuracies": 0,
                "mistakes": 1,
                "blunders": 0,
            },
            "middlegame": {
                "moves": 0,
                "avg_cpl": 0,
                "inaccuracies": 0,
                "mistakes": 0,
                "blunders": 0,
            },
            "endgame": {
                "moves": 0,
                "avg_cpl": 0,
                "inaccuracies": 0,
                "mistakes": 0,
                "blunders": 0,
            },
        },
        "detected_patterns": ["opening calculation errors"],
        "recommended_focus": ["opening discipline"],
        "theory_queries": ["opening principles"],
    }


def test_empty_database_migrates_to_head_without_model_drift(
    migrated_database_url: str,
) -> None:
    engine = create_engine(migrated_database_url)
    try:
        inspector = inspect(engine)
        assert set(inspector.get_table_names()) == EXPECTED_TABLES

        with engine.connect() as connection:
            revision = connection.scalar(
                text("SELECT version_num FROM alembic_version")
            )
            context = MigrationContext.configure(connection)
            assert compare_metadata(context, Base.metadata) == []

        assert revision == "0002_timestamp_columns_not_null"
    finally:
        engine.dispose()


def test_repositories_round_trip_relations_and_jsonb(db_session: Session) -> None:
    game = make_game()
    analysis = make_analysis()
    weakness_data = make_weakness_profile()
    rag_sources = [
        {
            "source": "fixture://rook-endgame",
            "study_id": "fixture-study",
            "chapter": "Rook activity",
            "distance": 0.12,
        }
    ]

    user = get_or_create_user(db_session, "IntegrationUser")
    assert get_or_create_user(db_session, "IntegrationUser").id == user.id
    game_analysis = save_game_analysis(
        db_session,
        user,
        game,
        analysis,
        "IntegrationUser",
    )
    moves = save_critical_moves(
        db_session,
        game_analysis,
        analysis["critical_moments"],
    )
    weakness = upsert_weakness_profile(db_session, user, weakness_data)
    recommendation = save_training_recommendation(
        db_session,
        user,
        weakness,
        {
            "priority": "opening discipline",
            "week_plan": ["Review one opening mistake.", "Play one training game."],
        },
        rag_sources,
    )
    db_session.commit()
    db_session.expire_all()

    stored_user = get_user_by_username(db_session, "IntegrationUser")
    stored_analyses = get_user_analyses(db_session, "IntegrationUser")
    stored_weakness = get_user_weakness_profile(db_session, "IntegrationUser")
    stored_recommendations = get_user_recommendations(
        db_session,
        "IntegrationUser",
    )

    assert stored_user is not None
    assert stored_analyses[0].analysis_summary == analysis["summary"]
    assert stored_analyses[0].move_analyses[0].fen_after == "fen-after"
    assert moves[0].game_analysis.user.id == stored_user.id
    assert stored_weakness is not None
    assert stored_weakness.profile_data == weakness_data
    assert stored_recommendations[0].rag_sources == rag_sources
    assert recommendation.weakness_profile.user.id == stored_user.id


def test_existing_analysis_profile_and_critical_moves_are_replaced(
    db_session: Session,
) -> None:
    user = get_or_create_user(db_session, "IntegrationUser")
    game = make_game()
    first_analysis = make_analysis()
    stored_analysis = save_game_analysis(
        db_session,
        user,
        game,
        first_analysis,
        "IntegrationUser",
    )
    save_critical_moves(
        db_session,
        stored_analysis,
        first_analysis["critical_moments"],
    )
    first_profile = upsert_weakness_profile(
        db_session,
        user,
        make_weakness_profile(),
    )
    db_session.commit()

    replacement = make_analysis(total_moves=8, cpl=410)
    replacement["critical_moments"][0].update(
        {
            "move_uci": "d1h5",
            "move_san": "Qh5",
            "classification": "blunder",
        }
    )
    updated_analysis = save_game_analysis(
        db_session,
        user,
        game,
        replacement,
        "IntegrationUser",
    )
    save_critical_moves(
        db_session,
        updated_analysis,
        replacement["critical_moments"],
    )
    updated_profile = upsert_weakness_profile(
        db_session,
        user,
        make_weakness_profile(games_analyzed=3),
    )
    db_session.commit()
    db_session.expire_all()

    assert updated_analysis.id == stored_analysis.id
    assert updated_profile.id == first_profile.id
    assert db_session.scalar(select(func.count(GameAnalysis.id))) == 1
    assert db_session.scalar(select(func.count(WeaknessProfile.id))) == 1
    stored_moves = list(db_session.scalars(select(MoveAnalysis)))
    assert len(stored_moves) == 1
    assert stored_moves[0].move_uci == "d1h5"
    assert updated_analysis.total_moves == 8
    assert updated_profile.games_analyzed == 3


def test_foreign_keys_are_enforced(db_session: Session) -> None:
    db_session.add(
        GameAnalysis(
            user_id=999_999,
            lichess_game_id="missing-user",
            pgn="1. e4 *",
            total_moves=1,
            analysis_summary={},
        )
    )

    with pytest.raises(IntegrityError):
        db_session.commit()

    db_session.rollback()
    assert db_session.scalar(select(func.count(GameAnalysis.id))) == 0


def test_coach_persistence_transaction_commits_complete_graph(
    db_session: Session,
) -> None:
    game = make_game()
    analysis = make_analysis()
    analyzed_game = AnalyzedPlayerGame(
        game=game,
        full_analysis=analysis,
        player_analysis=analysis,
        player_color="white",
    )

    persist_coach_result(
        db=db_session,
        username="IntegrationUser",
        analyzed_games=[analyzed_game],
        weakness_profile=make_weakness_profile(),
        theory_recommendations=[
            {
                "source": "fixture://opening",
                "chapter": "Opening principles",
            }
        ],
        training_plan={
            "priority": "opening discipline",
            "week_plan": ["Review the critical move."],
        },
    )

    verification = Session(db_session.get_bind())
    try:
        assert verification.scalar(select(func.count(UserProfile.id))) == 1
        assert verification.scalar(select(func.count(GameAnalysis.id))) == 1
        assert verification.scalar(select(func.count(MoveAnalysis.id))) == 1
        assert verification.scalar(select(func.count(WeaknessProfile.id))) == 1
        assert verification.scalar(select(func.count(TrainingRecommendation.id))) == 1
    finally:
        verification.close()


def test_coach_persistence_transaction_rolls_back_everything(
    db_session: Session,
) -> None:
    game = make_game()
    analysis = make_analysis()
    analyzed_game = AnalyzedPlayerGame(
        game=game,
        full_analysis=analysis,
        player_analysis=analysis,
        player_color="white",
    )

    with pytest.raises(TypeError):
        persist_coach_result(
            db=db_session,
            username="IntegrationUser",
            analyzed_games=[analyzed_game],
            weakness_profile=make_weakness_profile(),
            theory_recommendations=[],
            training_plan={
                "priority": "invalid",
                "week_plan": [None],
            },
        )

    verification = Session(db_session.get_bind())
    try:
        for model in (
            UserProfile,
            GameAnalysis,
            MoveAnalysis,
            WeaknessProfile,
            TrainingRecommendation,
        ):
            assert verification.scalar(select(func.count(model.id))) == 0
    finally:
        verification.close()
