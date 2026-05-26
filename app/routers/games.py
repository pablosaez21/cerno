from fastapi import APIRouter, HTTPException
from app.services.lichess import fetch_games
from app.schemas.game import GamesResponse
from app.services.stockfish import analyze_game

router = APIRouter(prefix="/games", tags=["games"])


@router.get("/{username}", response_model=GamesResponse)
async def get_games(username: str, limit: int = 10):
    games = await fetch_games(username, limit)
    if games is None:
        raise HTTPException(status_code=502, detail="Error fetching games from Lichess")
    return GamesResponse(username=username, total=len(games), games=games)



@router.post("/analyze")
async def analyze(pgn: str):
    result = await analyze_game(pgn)
    return result