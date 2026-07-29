import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.lichess import (
    LICHESS_USER_AGENT,
    LichessRateLimitError,
    LichessServiceError,
    LichessUserNotFoundError,
    fetch_games,
)


@pytest.fixture(autouse=True)
def reset_lichess_request_state(monkeypatch):
    monkeypatch.setattr("app.services.lichess._request_lock", asyncio.Lock())
    monkeypatch.setattr("app.services.lichess._rate_limited_until", 0.0)


def mock_async_client(response: httpx.Response) -> tuple[MagicMock, AsyncMock]:
    get = AsyncMock(return_value=response)
    client = MagicMock()
    client.get = get

    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=client)
    context.__aexit__ = AsyncMock(return_value=None)
    return context, get


def test_fetch_games_identifies_cerno_and_parses_ndjson():
    raw_game = {
        "id": "game-1",
        "speed": "rapid",
        "rated": True,
        "winner": "white",
        "status": "mate",
        "players": {
            "white": {"user": {"name": "PSM12"}, "rating": 1800},
            "black": {"user": {"name": "Opponent"}, "rating": 1790},
        },
        "moves": "e4 e5 Nf3",
        "pgn": '[Event "Test"]\n\n1. e4 e5 2. Nf3 *',
    }
    request = httpx.Request("GET", "https://lichess.org")
    response = httpx.Response(200, text=json.dumps(raw_game), request=request)
    context, get = mock_async_client(response)

    with patch("app.services.lichess.httpx.AsyncClient", return_value=context):
        games = asyncio.run(fetch_games(" PSM12 ", 1))

    assert len(games) == 1
    assert games[0].id == "game-1"
    assert games[0].white.username == "PSM12"
    get.assert_awaited_once_with(
        "https://lichess.org/api/games/user/PSM12",
        headers={
            "Accept": "application/x-ndjson",
            "User-Agent": LICHESS_USER_AGENT,
        },
        params={"max": 1, "pgnInJson": "true"},
    )


def test_fetch_games_uses_configured_adapter_base_url(monkeypatch):
    raw_game = {
        "id": "fixture-game",
        "speed": "rapid",
        "rated": False,
        "status": "draw",
        "players": {
            "white": {"user": {"name": "PSM 12"}},
            "black": {"user": {"name": "Opponent"}},
        },
        "moves": "e4 e5",
        "pgn": '[Event "Fixture"]\n\n1. e4 e5 *',
    }
    request = httpx.Request("GET", "http://127.0.0.1:4300")
    response = httpx.Response(200, text=json.dumps(raw_game), request=request)
    context, get = mock_async_client(response)
    monkeypatch.setattr(
        "app.services.lichess.settings.lichess_api_base_url",
        "http://127.0.0.1:4300/",
    )

    with patch("app.services.lichess.httpx.AsyncClient", return_value=context):
        games = asyncio.run(fetch_games("PSM 12", 1))

    assert games[0].id == "fixture-game"
    assert get.await_args.args[0] == "http://127.0.0.1:4300/api/games/user/PSM%2012"


@pytest.mark.parametrize(
    ("status_code", "exception_type", "message"),
    [
        (404, LichessUserNotFoundError, "was not found"),
        (429, LichessRateLimitError, "Wait one minute"),
        (500, LichessServiceError, r"unexpected response \(500\)"),
    ],
)
def test_fetch_games_reports_lichess_errors(
    status_code: int,
    exception_type: type[Exception],
    message: str,
):
    request = httpx.Request("GET", "https://lichess.org")
    response = httpx.Response(status_code, request=request)
    context, _ = mock_async_client(response)

    with (
        patch("app.services.lichess.httpx.AsyncClient", return_value=context),
        pytest.raises(exception_type, match=message),
    ):
        asyncio.run(fetch_games("PSM12", 1))


def test_fetch_games_reports_connection_errors():
    request = httpx.Request("GET", "https://lichess.org")
    get = AsyncMock(side_effect=httpx.ConnectError("offline", request=request))
    client = MagicMock()
    client.get = get
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=client)
    context.__aexit__ = AsyncMock(return_value=None)

    with (
        patch("app.services.lichess.httpx.AsyncClient", return_value=context),
        pytest.raises(LichessServiceError, match="Could not connect"),
    ):
        asyncio.run(fetch_games("PSM12", 1))


def test_coach_endpoint_surfaces_lichess_rate_limit(client):
    error = LichessRateLimitError(
        "Lichess is temporarily limiting requests. Wait one minute and try again."
    )

    with patch(
        "app.routers.coach.analyze_user",
        new=AsyncMock(side_effect=error),
    ):
        response = client.post(
            "/coach/analyze-user",
            json={
                "username": "PSM12",
                "limit": 1,
                "depth": 1,
                "save": False,
            },
        )

    assert response.status_code == 503
    assert response.headers["retry-after"] == "60"
    assert response.json() == {"detail": str(error)}
