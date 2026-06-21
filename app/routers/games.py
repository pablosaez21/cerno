from fastapi import APIRouter, Body, HTTPException
from app.core.config import settings
from app.services.lichess import fetch_games
from app.schemas.game import AnalyzeGameRequest, GamesResponse
from app.services.stockfish import analyze_game

router = APIRouter(prefix="/games", tags=["games"])


@router.get("/{username}", response_model=GamesResponse)
async def get_games(username: str, limit: int = 10):
    games = await fetch_games(username, settings.clamp_games_limit(limit))
    if games is None:
        raise HTTPException(status_code=502, detail="Error fetching games from Lichess")
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
        return await analyze_game(pgn_text, analysis_depth)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
