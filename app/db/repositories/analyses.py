from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import GameAnalysis, MoveAnalysis, UserProfile
from app.schemas.game import Game


def save_game_analysis(
    db: Session,
    user: UserProfile,
    game: Game,
    analysis: dict,
    username: str,
) -> GameAnalysis:
    existing = db.scalar(
        select(GameAnalysis).where(
            GameAnalysis.user_id == user.id,
            GameAnalysis.lichess_game_id == game.id,
        )
    )

    if existing:
        existing.pgn = game.pgn
        existing.opponent = get_opponent(game, username)
        existing.color_played = get_color_played(game, username)
        existing.result = get_result(game, username)
        existing.opening_name = extract_opening_name(game.pgn)
        existing.total_moves = analysis.get("total_moves", 0)
        existing.analysis_summary = analysis.get("summary", {})
        db.flush()
        return existing

    game_analysis = GameAnalysis(
        user_id=user.id,
        lichess_game_id=game.id,
        pgn=game.pgn,
        opponent=get_opponent(game, username),
        color_played=get_color_played(game, username),
        result=get_result(game, username),
        opening_name=extract_opening_name(game.pgn),
        total_moves=analysis.get("total_moves", 0),
        analysis_summary=analysis.get("summary", {}),
    )
    db.add(game_analysis)
    db.flush()
    return game_analysis


def save_critical_moves(
    db: Session,
    game_analysis: GameAnalysis,
    critical_moments: list[dict],
) -> list[MoveAnalysis]:
    db.query(MoveAnalysis).filter(
        MoveAnalysis.game_analysis_id == game_analysis.id
    ).delete()

    saved = []
    for moment in critical_moments:
        move = MoveAnalysis(
            game_analysis_id=game_analysis.id,
            move_number=moment.get("move_number", 0),
            move_uci=moment.get("move_uci", ""),
            move_san=moment.get("move_san", ""),
            phase=moment.get("phase", "unknown"),
            evaluation_before=moment.get("evaluation_before"),
            evaluation_after=moment.get("evaluation_after"),
            cpl=moment.get("cpl", 0),
            classification=moment.get("classification", "unknown"),
            fen_before=moment.get("fen_before", ""),
            fen_after=moment.get("fen_after", ""),
        )
        db.add(move)
        saved.append(move)

    db.flush()
    return saved


def get_user_analyses(db: Session, username: str) -> list[GameAnalysis]:
    statement = (
        select(GameAnalysis)
        .join(UserProfile)
        .where(UserProfile.lichess_username == username)
        .order_by(GameAnalysis.created_at.desc())
    )
    return list(db.scalars(statement))


def get_opponent(game: Game, username: str) -> str | None:
    if game.white.username.lower() == username.lower():
        return game.black.username
    if game.black.username.lower() == username.lower():
        return game.white.username
    return None


def get_color_played(game: Game, username: str) -> str | None:
    if game.white.username.lower() == username.lower():
        return "white"
    if game.black.username.lower() == username.lower():
        return "black"
    return None


def get_result(game: Game, username: str) -> str:
    color = get_color_played(game, username)
    if game.winner is None:
        return "draw"
    if color == game.winner:
        return "win"
    return "loss"


def extract_opening_name(pgn: str) -> str | None:
    for line in pgn.splitlines():
        if line.startswith('[Opening "') and line.endswith('"]'):
            return line[len('[Opening "'):-2]
    return None
