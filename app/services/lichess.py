import httpx

from app.core.config import settings
from app.schemas.game import Game, Player


def parse_player(raw_player: dict, fallback_name: str) -> Player:
    user = raw_player.get("user") or {}
    return Player(
        username=user.get("name", fallback_name),
        rating=raw_player.get("rating"),
        rating_diff=raw_player.get("ratingDiff")
    )


async def fetch_games(username: str, limit: int = 10) -> list[Game]:
    limit = settings.clamp_games_limit(limit)

    url = f"https://lichess.org/api/games/user/{username}"
    headers = {"Accept": "application/x-ndjson"}
    params = {"max": limit, "pgnInJson": True}

    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers, params=params)

    if response.status_code != 200:
        return []

    games = []
    for line in response.text.strip().split("\n"):
        if not line:
            continue
        import json
        raw = json.loads(line)

        white = parse_player(raw["players"]["white"], "Anonymous")
        black = parse_player(raw["players"]["black"], "Anonymous")

        games.append(Game(
            id=raw["id"],
            speed=raw["speed"],
            rated=raw["rated"],
            winner=raw.get("winner"),
            status=raw["status"],
            white=white,
            black=black,
            moves=raw.get("moves", ""),
            pgn=raw.get("pgn", "")
        ))

    return games
