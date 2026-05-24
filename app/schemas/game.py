from pydantic import BaseModel
from typing import Optional

class Player(BaseModel):
    username: str
    rating: Optional[int] = None
    rating_diff: Optional[int] = None

class Game(BaseModel):
    id: str
    speed: str
    rated: bool
    winner: Optional[str] = None
    status: str
    white: Player
    black: Player
    moves: str
    pgn: str

class GamesResponse(BaseModel):
    username: str
    total: int
    games: list[Game]