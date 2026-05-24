import httpx
from app.schemas.game import Game, Player

async def fetch_games(username: str, limit: int = 10) -> list[Game]:
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

        white = Player(
            username=raw["players"]["white"]["user"]["name"],
            rating=raw["players"]["white"].get("rating"),
            rating_diff=raw["players"]["white"].get("ratingDiff")
        )
        black = Player(
            username=raw["players"]["black"]["user"]["name"],
            rating=raw["players"]["black"].get("rating"),
            rating_diff=raw["players"]["black"].get("ratingDiff")
        )

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