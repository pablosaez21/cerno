import asyncio
import json
import math
import time
from urllib.parse import quote

import httpx

from app.core.config import settings
from app.schemas.game import Game, Player

LICHESS_USER_AGENT = "Cerno/1.0 (local chess analysis)"
LICHESS_RATE_LIMIT_SECONDS = 60
_request_lock = asyncio.Lock()
_rate_limited_until = 0.0


class LichessServiceError(RuntimeError):
    """Raised when Lichess cannot provide usable game data."""


class LichessRateLimitError(LichessServiceError):
    """Raised when Lichess asks the client to pause requests."""

    def __init__(self, message: str, retry_after: int = LICHESS_RATE_LIMIT_SECONDS):
        super().__init__(message)
        self.retry_after = retry_after


class LichessUserNotFoundError(ValueError):
    """Raised when the requested Lichess account does not exist."""


def parse_player(raw_player: dict, fallback_name: str) -> Player:
    user = raw_player.get("user") or {}
    return Player(
        username=user.get("name", fallback_name),
        rating=raw_player.get("rating"),
        rating_diff=raw_player.get("ratingDiff"),
    )


async def fetch_games(username: str, limit: int = 10) -> list[Game]:
    global _rate_limited_until

    username = username.strip()
    if not username:
        raise ValueError("A Lichess username is required.")

    limit = settings.clamp_games_limit(limit)

    encoded_username = quote(username, safe="")
    base_url = settings.lichess_api_base_url.rstrip("/")
    url = f"{base_url}/api/games/user/{encoded_username}"
    headers = {
        "Accept": "application/x-ndjson",
        "User-Agent": LICHESS_USER_AGENT,
    }
    params: dict[str, str | int] = {"max": limit, "pgnInJson": "true"}

    async with _request_lock:
        retry_after = math.ceil(_rate_limited_until - time.monotonic())
        if retry_after > 0:
            raise LichessRateLimitError(
                "Lichess is temporarily limiting requests. "
                f"Wait {retry_after} seconds and try again.",
                retry_after=retry_after,
            )

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=headers, params=params)
        except httpx.RequestError as exc:
            raise LichessServiceError(
                "Could not connect to Lichess. Try again shortly."
            ) from exc

        if response.status_code == 429:
            _rate_limited_until = time.monotonic() + LICHESS_RATE_LIMIT_SECONDS
            raise LichessRateLimitError(
                "Lichess is temporarily limiting requests. "
                "Wait one minute and try again."
            )

    if response.status_code == 404:
        raise LichessUserNotFoundError(f"Lichess user '{username}' was not found.")
    if response.status_code != 200:
        raise LichessServiceError(
            f"Lichess returned an unexpected response ({response.status_code})."
        )

    games = []
    for line in response.text.strip().split("\n"):
        if not line:
            continue
        try:
            raw = json.loads(line)
            white = parse_player(raw["players"]["white"], "Anonymous")
            black = parse_player(raw["players"]["black"], "Anonymous")
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            raise LichessServiceError("Lichess returned malformed game data.") from exc

        try:
            games.append(
                Game(
                    id=raw["id"],
                    speed=raw["speed"],
                    rated=raw["rated"],
                    winner=raw.get("winner"),
                    status=raw["status"],
                    white=white,
                    black=black,
                    moves=raw.get("moves", ""),
                    pgn=raw.get("pgn", ""),
                )
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise LichessServiceError("Lichess returned malformed game data.") from exc

    return games
