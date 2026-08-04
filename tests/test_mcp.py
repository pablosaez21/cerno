import asyncio
import json
import sys
from contextlib import suppress
from datetime import timedelta
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.shared.exceptions import McpError
from mcp.shared.memory import create_connected_server_and_client_session
from mcp.types import CancelledNotification, CancelledNotificationParams

from app import mcp_server
from app.schemas.game import Game, Player
from app.schemas.rag import TheoryEvidence, TheoryRetrievalResult
from app.services.lichess import LichessServiceError

PROJECT_ROOT = Path(__file__).resolve().parents[1]
VALID_PGN = (
    '[Event "MCP fixture"]\n'
    '[White "FixtureWhite"]\n'
    '[Black "FixtureBlack"]\n'
    '[Result "1-0"]\n\n'
    "1. e4 e5 2. Qh5 Nc6 3. Qxe5+ Nxe5 1-0"
)


def fixture_game() -> Game:
    return Game(
        id="game-1",
        speed="rapid",
        rated=True,
        winner="white",
        status="mate",
        white=Player(username="FixtureWhite"),
        black=Player(username="FixtureBlack"),
        moves="e4 e5 Qh5 Nc6 Qxe5+ Nxe5",
        pgn=VALID_PGN,
    )


def fixture_analysis() -> dict:
    white_blunder = {
        "move_number": 3,
        "move_uci": "h5e5",
        "move_san": "Qxe5+",
        "mover_color": "white",
        "phase": "opening",
        "evaluation_before": 0.2,
        "evaluation_after": -4.1,
        "cpl": 430,
        "classification": "blunder",
        "fen_before": "sensitive-fen-before",
        "fen_after": "sensitive-fen-after",
    }
    black_mistake = {
        "move_number": 3,
        "move_uci": "c6e5",
        "move_san": "Nxe5",
        "mover_color": "black",
        "phase": "opening",
        "evaluation_before": 4.1,
        "evaluation_after": 2.7,
        "cpl": 140,
        "classification": "mistake",
        "fen_before": "black-fen-before",
        "fen_after": "black-fen-after",
    }
    moves = [
        {
            **white_blunder,
            "move_number": 1,
            "move_uci": "e2e4",
            "move_san": "e4",
            "cpl": 10,
            "classification": "good",
        },
        {
            **black_mistake,
            "move_number": 1,
            "move_uci": "e7e5",
            "move_san": "e5",
            "cpl": 12,
            "classification": "good",
        },
        white_blunder,
        black_mistake,
    ]
    return {
        "total_moves": len(moves),
        "summary": {},
        "moves": moves,
        "critical_moments": [white_blunder, black_mistake],
        "phase_weaknesses": ["opening"],
    }


def fixture_retrieval(*, evidence: bool = True) -> TheoryRetrievalResult:
    documents = []
    if evidence:
        documents.append(
            TheoryEvidence(
                text="Develop pieces before moving the queen repeatedly.",
                metadata={
                    "source_id": "opening-study",
                    "study_id": "opening-study",
                    "study_title": "Opening Principles",
                    "chapter": "Development",
                    "phase": "opening",
                    "category": "opening_principles",
                    "author": "FixtureAuthor",
                    "attribution_url": "https://lichess.org/@/FixtureAuthor",
                    "source": "https://lichess.org/study/opening-study",
                    "content_license": (
                        "Public Lichess study; no explicit reuse license"
                    ),
                },
                distance=0.25,
            )
        )
    return TheoryRetrievalResult(
        status="evidence_found" if documents else "insufficient_evidence",
        query="opening principles",
        pipeline_version="rag-v1",
        documents=documents,
    )


def fixture_player_report() -> dict:
    return {
        "username": "FixtureWhite",
        "games_requested": 1,
        "games_analyzed": 1,
        "diagnosis": {
            "main_weakness": "opening",
            "secondary_weakness": None,
            "phase_stats": {
                "opening": {
                    "moves": 2,
                    "avg_cpl": 220.0,
                    "inaccuracies": 0,
                    "mistakes": 0,
                    "blunders": 1,
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
            "detected_patterns": ["missed tactics", "opening discipline"],
        },
        "weaknesses": ["Opening phase weaknesses"],
        "critical_moments": [
            {
                "game_id": "game-1",
                "move_number": 3,
                "move": "Qxe5+",
                "phase": "opening",
                "cpl": 430,
                "classification": "blunder",
            }
        ],
        "actionable_recommendations": [
            {
                "title": "Review the critical decisions",
                "actions": ["Replay the position before 3. Qxe5+."],
                "evidence_type": "game_analysis",
                "source_ids": [],
            },
            {
                "title": "Start with Opening Principles",
                "actions": ["Review the development chapter."],
                "evidence_type": "theory",
                "source_ids": ["S1"],
            },
        ],
        "sources": [
            {
                "citation_id": "S1",
                "source_id": "opening-study",
                "title": "Opening Principles",
                "chapter": "Development",
                "phase": "opening",
                "category": "opening_principles",
                "author": "FixtureAuthor",
                "attribution": "https://lichess.org/@/FixtureAuthor",
                "canonical_url": "https://lichess.org/study/opening-study",
            }
        ],
        "game_analyses": [
            {
                "game_id": "game-1",
                "player_color": "white",
                "total_moves": 4,
                "moves": [{"fen_before": "must-not-leak"}],
            }
        ],
        "skipped_games": [],
        "saved": False,
    }


async def call_tool(name: str, arguments: dict):
    async with create_connected_server_and_client_session(
        mcp_server.server,
        raise_exceptions=False,
    ) as session:
        return await session.call_tool(name, arguments)


def call(name: str, arguments: dict):
    return asyncio.run(call_tool(name, arguments))


def structured(result) -> dict:
    assert result.structuredContent is not None
    return result.structuredContent


def test_stdio_client_discovers_only_three_typed_tools():
    async def discover():
        parameters = StdioServerParameters(
            command=sys.executable,
            args=["-m", "app.mcp_server"],
            cwd=PROJECT_ROOT,
        )
        async with stdio_client(parameters) as (read, write):
            async with ClientSession(
                read,
                write,
                read_timeout_seconds=timedelta(seconds=15),
            ) as session:
                await session.initialize()
                return (await session.list_tools()).tools

    tools = asyncio.run(discover())
    assert [tool.name for tool in tools] == [
        "analyze_pgn",
        "analyze_lichess_player",
        "search_chess_theory",
    ]
    assert all(tool.outputSchema for tool in tools)
    assert all(tool.annotations and tool.annotations.readOnlyHint for tool in tools)
    schemas = {tool.name: tool.inputSchema for tool in tools}
    assert schemas["analyze_pgn"]["properties"]["pgn"]["maxLength"] == 100_000
    assert schemas["analyze_pgn"]["properties"]["depth"]["maximum"] == 10
    assert (
        schemas["analyze_lichess_player"]["properties"]["games_limit"]["maximum"] == 3
    )
    assert schemas["search_chess_theory"]["properties"]["max_results"]["maximum"] == 3
    assert "index_study" not in schemas


def test_analyze_pgn_returns_compact_neutral_analysis():
    analysis = fixture_analysis()
    with patch.object(
        mcp_server.stockfish_service,
        "analyze_game",
        new=AsyncMock(return_value=analysis),
    ) as analyze_game:
        result = call("analyze_pgn", {"pgn": VALID_PGN, "depth": 6})

    payload = structured(result)
    assert payload["status"] == "success"
    assert payload["data"]["scope"] == "full_game"
    assert payload["data"]["player_color"] is None
    assert payload["data"]["metrics"]["total_plies"] == 4
    assert payload["data"]["priority_phase"] == "opening"
    assert {
        moment["mover_color"] for moment in payload["data"]["critical_moments"]
    } == {
        "white",
        "black",
    }
    assert payload["data"]["studies"] == []
    assert "moves" not in payload["data"]
    assert "sensitive-fen" not in json.dumps(payload)
    analyze_game.assert_awaited_once_with(VALID_PGN, 6)


def test_analyze_pgn_with_color_reuses_player_service_without_generation():
    report = fixture_player_report()
    analyze_player = AsyncMock(return_value=report)
    with patch.object(
        mcp_server.coach_service,
        "analyze_pgn_for_player",
        new=analyze_player,
    ):
        result = call(
            "analyze_pgn",
            {"pgn": VALID_PGN, "player_color": "white"},
        )

    payload = structured(result)
    assert payload["data"]["scope"] == "player"
    assert payload["data"]["player_color"] == "white"
    assert payload["data"]["patterns"] == [
        "missed tactics",
        "opening discipline",
    ]
    assert payload["data"]["studies"][0]["url"].startswith("https://lichess.org/study/")
    analyze_player.assert_awaited_once_with(
        VALID_PGN,
        "white",
        8,
        generate_with_llm=False,
    )


def test_lichess_tool_reuses_complete_pipeline_without_openai_or_persistence():
    analysis = fixture_analysis()
    generate = AsyncMock(side_effect=AssertionError("OpenAI must not be called"))
    persist = Mock(side_effect=AssertionError("Persistence must not be called"))
    with (
        patch(
            "app.services.coach.fetch_games",
            new=AsyncMock(return_value=[fixture_game()]),
        ) as fetch_games,
        patch(
            "app.services.coach.analyze_game",
            new=AsyncMock(return_value=analysis),
        ) as analyze_game,
        patch(
            "app.services.coach.retrieve_theory",
            new=Mock(return_value=fixture_retrieval()),
        ),
        patch("app.services.coach.generate_training_plan", new=generate),
        patch("app.services.coach.persist_coach_result", new=persist),
    ):
        result = call(
            "analyze_lichess_player",
            {"username": "FixtureWhite", "games_limit": 1},
        )

    payload = structured(result)
    assert payload["status"] == "success"
    assert payload["data"]["subject"] == "FixtureWhite"
    assert payload["data"]["metrics"]["games_analyzed"] == 1
    assert payload["data"]["metrics"]["total_plies"] == 4
    assert payload["data"]["studies"][0]["title"] == "Opening Principles"
    assert payload["data"]["recommendations"]
    assert "fen_before" not in json.dumps(payload)
    fetch_games.assert_awaited_once_with("FixtureWhite", 1)
    analyze_game.assert_awaited_once_with(VALID_PGN, 8)
    generate.assert_not_awaited()
    persist.assert_not_called()


def test_theory_search_returns_typed_untrusted_evidence_and_filters():
    retrieve = Mock(return_value=fixture_retrieval())
    with patch.object(mcp_server.rag_service, "retrieve_theory", new=retrieve):
        result = call(
            "search_chess_theory",
            {
                "query": "opening development",
                "phase": "opening",
                "category": "opening_principles",
                "max_results": 2,
            },
        )

    payload = structured(result)
    assert payload["status"] == "success"
    assert payload["data"]["status"] == "evidence_found"
    assert payload["data"]["results"][0] == {
        "title": "Opening Principles",
        "chapter": "Development",
        "fragment": "Develop pieces before moving the queen repeatedly.",
        "phase": "opening",
        "category": "opening_principles",
        "author": "FixtureAuthor",
        "attribution": "https://lichess.org/@/FixtureAuthor",
        "url": "https://lichess.org/study/opening-study",
        "distance": 0.25,
        "content_trust": "untrusted",
    }
    retrieve.assert_called_once_with(
        "opening development",
        n_results=2,
        phase="opening",
        category="opening_principles",
    )


def test_theory_search_preserves_insufficient_evidence():
    with patch.object(
        mcp_server.rag_service,
        "retrieve_theory",
        new=Mock(return_value=fixture_retrieval(evidence=False)),
    ):
        result = call("search_chess_theory", {"query": "quantum chess strategy"})

    payload = structured(result)
    assert payload["status"] == "success"
    assert payload["data"]["status"] == "insufficient_evidence"
    assert payload["data"]["results"] == []


def test_invalid_and_oversized_pgn_errors_are_controlled_and_sanitized():
    oversized = call(
        "analyze_pgn",
        {"pgn": "TOP_SECRET" + "x" * mcp_server.MCP_MAX_PGN_CHARS},
    )
    invalid = call("analyze_pgn", {"pgn": "not a PGN"})

    oversized_payload = structured(oversized)
    invalid_payload = structured(invalid)
    assert oversized_payload["error"]["code"] == "invalid_request"
    assert invalid_payload["error"]["code"] == "invalid_pgn"
    assert "TOP_SECRET" not in json.dumps(oversized_payload)
    assert "not a PGN" not in json.dumps(invalid_payload)


def test_invalid_username_and_games_limit_are_rejected():
    invalid_username = call("analyze_lichess_player", {"username": "   "})
    invalid_limit = call(
        "analyze_lichess_player",
        {"username": "FixtureWhite", "games_limit": 4},
    )

    assert structured(invalid_username)["error"]["code"] == "invalid_request"
    assert invalid_limit.isError is True
    assert invalid_limit.structuredContent is None
    assert "less than or equal to 3" in invalid_limit.content[0].text


def test_lichess_failure_is_structured_without_provider_details():
    with patch.object(
        mcp_server.coach_service,
        "analyze_user",
        new=AsyncMock(
            side_effect=LichessServiceError(
                "provider body included SECRET_TOKEN and an internal URL"
            )
        ),
    ):
        result = call(
            "analyze_lichess_player",
            {"username": "FixtureWhite"},
        )

    payload = structured(result)
    assert payload["error"]["code"] == "dependency_unavailable"
    assert "SECRET_TOKEN" not in json.dumps(payload)
    assert "internal URL" not in json.dumps(payload)


def test_stockfish_failure_and_timeout_are_controlled():
    with patch.object(
        mcp_server.stockfish_service,
        "analyze_game",
        new=AsyncMock(side_effect=RuntimeError("C:\\private\\SECRET_ENGINE")),
    ):
        failed = call("analyze_pgn", {"pgn": VALID_PGN})

    async def never_finishes(*args, **kwargs):
        del args, kwargs
        await asyncio.Event().wait()

    with (
        patch.object(
            mcp_server.stockfish_service,
            "analyze_game",
            new=never_finishes,
        ),
        patch.object(mcp_server, "MCP_PGN_TIMEOUT_SECONDS", 0.01),
    ):
        timed_out = call("analyze_pgn", {"pgn": VALID_PGN})

    failed_payload = structured(failed)
    timeout_payload = structured(timed_out)
    assert failed_payload["error"]["code"] == "analysis_failed"
    assert "SECRET_ENGINE" not in json.dumps(failed_payload)
    assert timeout_payload["error"]["code"] == "timeout"


def test_client_cancellation_reaches_the_running_analysis():
    started = asyncio.Event()
    cancelled = asyncio.Event()

    async def cancellable_analysis(*args, **kwargs):
        del args, kwargs
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    async def cancel_from_client():
        async with create_connected_server_and_client_session(
            mcp_server.server,
            raise_exceptions=False,
        ) as session:
            request_id = session._request_id
            task = asyncio.create_task(
                session.call_tool("analyze_pgn", {"pgn": VALID_PGN})
            )
            await asyncio.wait_for(started.wait(), timeout=1)
            await session.send_notification(
                CancelledNotification(
                    params=CancelledNotificationParams(
                        requestId=request_id,
                        reason="Test cancellation",
                    )
                )
            )
            with suppress(McpError):
                await asyncio.wait_for(task, timeout=1)
            await asyncio.wait_for(cancelled.wait(), timeout=1)

    with patch.object(
        mcp_server.stockfish_service,
        "analyze_game",
        new=cancellable_analysis,
    ):
        asyncio.run(cancel_from_client())
