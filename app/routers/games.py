from fastapi import APIRouter, Body, HTTPException

from app.core.config import settings
from app.schemas.game import AnalyzeGameRequest, GamesResponse
from app.services.coach import build_full_game_coaching
from app.services.lichess import (
    LichessRateLimitError,
    LichessServiceError,
    LichessUserNotFoundError,
    fetch_games,
)
from app.services.stockfish import analyze_game

router = APIRouter(prefix="/games", tags=["games"])


@router.get("/{username}", response_model=GamesResponse)
async def get_games(username: str, limit: int = 10):
    try:
        games = await fetch_games(username, settings.clamp_games_limit(limit))
    except LichessUserNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LichessRateLimitError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
            headers={"Retry-After": str(exc.retry_after)},
        ) from exc
    except LichessServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return GamesResponse(username=username, total=len(games), games=games)


@router.post("/analyze")
async def analyze(
    request: AnalyzeGameRequest | None = Body(default=None),
    pgn: str | None = None,
    depth: int = 12,
):
    pgn_text = request.pgn if request else pgn
    analysis_depth = request.depth if request else depth

    if not pgn_text:
        raise HTTPException(status_code=400, detail="PGN is required.")

    try:
        analysis_depth = settings.clamp_stockfish_depth(analysis_depth)
        analysis = await analyze_game(pgn_text, analysis_depth)
        return {
            **analysis,
            "coaching": build_full_game_coaching(analysis),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
