# Cerno local MCP server

**Status:** Implemented local portfolio integration
**Transport:** `stdio` only
**SDK:** official Python MCP SDK `mcp==1.28.1`
**Last validated:** 2026-08-04

## Purpose and boundary

The server lets a compatible local MCP host use Cerno's existing chess
analysis and educational retrieval capabilities. It is a thin protocol
adapter over the same Lichess, Stockfish, weakness, coach, and RAG services
used by the application.

The first release is deliberately read-only:

- no analysis is persisted;
- OpenAI is never called;
- the corpus cannot be indexed, reconciled, or modified;
- profiles and saved analyses cannot be changed;
- only local subprocess transport is available;
- no MCP resources or prompts are published.

The experimental OpenAI agent and this MCP server are separate entry points.
Neither calls the other.

## Installation and start command

Install the pinned dependencies from the repository root:

```powershell
venv\Scripts\python.exe -m pip install -r requirements.txt
```

Start the server:

```powershell
venv\Scripts\python.exe -m app.mcp_server
```

The process communicates with its host over standard input/output. It is
normal for it to appear idle when started directly. Do not type into that
terminal and do not add application output to stdout; MCP protocol messages
must remain the only stdout content.

The server reads the existing Cerno environment, notably `STOCKFISH_PATH`,
`CHROMA_PATH`, and `LICHESS_API_BASE_URL`. It does not need an
`OPENAI_API_KEY` and does not connect to PostgreSQL.

## Codex client configuration

Codex supports local MCP subprocesses through `~/.codex/config.toml` or a
trusted project's `.codex/config.toml`. On the development machine, add:

```toml
[mcp_servers.cerno]
command = 'C:\Users\pablo\Desktop\Cerno\venv\Scripts\python.exe'
args = ["-m", "app.mcp_server"]
cwd = 'C:\Users\pablo\Desktop\Cerno'
startup_timeout_sec = 15
tool_timeout_sec = 100
enabled = true
```

Restart the Codex client after saving the configuration. Then use `/mcp` or
`codex mcp list` to confirm that `cerno` is connected. The 100-second host
timeout is slightly longer than Cerno's longest server-side timeout, so the
server can return its typed timeout result.

Equivalent configurations can launch the same executable and arguments from
other MCP hosts that support local `stdio` servers. Codex is the explicitly
documented host configuration; automated compatibility validation uses the
official Python MCP client.

## Published tools

### `analyze_pgn`

Input:

```json
{
  "pgn": "[Event \"Example\"]\n...",
  "player_color": "white",
  "depth": 8
}
```

- `pgn` is required and limited to 100,000 characters.
- `player_color` is optional: `white` or `black`.
- `depth` defaults to 8 and must be from 1 to 10.

Without `player_color`, Cerno returns neutral full-game metrics and does not
attribute errors to a player. With a color, the shared player projection,
weakness, pattern, and theory pipeline is used. The compact result contains
metrics, three phase summaries, weaknesses, patterns, up to ten critical
moments, up to four recommendations, and up to three studies. It omits the
full move list, FEN positions, and internal prompt/generation data.

### `analyze_lichess_player`

Input:

```json
{
  "username": "Mikhail_Tal",
  "games_limit": 3
}
```

- `username` is required and limited to 50 characters.
- `games_limit` defaults to 3 and must be from 1 to 3.

The tool retrieves public games and reuses the complete non-persistent coach
pipeline: Lichess, Stockfish, player-only projection, weakness aggregation,
and RAG. Its compact output has the same analysis shape as player-specific PGN
analysis. It uses deterministic local recommendations and does not invoke the
coach's OpenAI generation path.

### `search_chess_theory`

Input:

```json
{
  "query": "How should I use an outside passed pawn?",
  "phase": "endgame",
  "category": "pawn_endgames",
  "max_results": 3
}
```

- `query` is required, English-only, and limited to 500 characters.
- `phase` is optional: `opening`, `middlegame`, or `endgame`.
- `category` is optional and limited to 80 characters.
- `max_results` defaults to 3 and must be from 1 to 3.

The nested retrieval status is either `evidence_found` or
`insufficient_evidence`. Each accepted result contains a bounded fragment,
title/chapter, phase/category, author, attribution, study URL, and distance.
Every result is marked `content_trust: "untrusted"`; retrieved study prose is
reference data, never an instruction to the host.

## Result and error contract

All three tools publish Pydantic-derived input and output JSON Schemas through
MCP discovery. Successful tool results have this envelope:

```json
{
  "status": "success",
  "data": {},
  "error": null
}
```

Controlled application failures use:

```json
{
  "status": "error",
  "data": null,
  "error": {
    "code": "dependency_unavailable",
    "message": "Stockfish is not available in the configured environment.",
    "retry_after_seconds": null
  }
}
```

Stable error codes cover invalid requests/PGN, missing or rate-limited Lichess
users, timeouts, unavailable dependencies, failed engine analysis, and failed
retrieval. Provider responses, local paths, exception text, PGN contents, and
credentials are not copied into tool errors. Protocol-level type/range errors
remain standard MCP tool errors generated from the published schema.

## Limits and timeouts

| Boundary | Limit |
| --- | ---: |
| PGN text | 100,000 characters |
| Stockfish depth | 1-10; default 8 |
| Lichess games | 1-3; default 3 |
| Theory results | 1-3; default 3 |
| Critical moments returned | 10 |
| Theory fragment | 1,200 characters |
| PGN analysis timeout | 60 seconds |
| Lichess player pipeline timeout | 90 seconds |
| Theory retrieval timeout | 15 seconds |

Client cancellation is propagated through the MCP request to the running
async analysis. Work delegated to blocking third-party libraries or a worker
thread remains cooperative and may take a short time to stop at that external
boundary.

## Brief usage examples

After the host discovers `cerno`, requests can be phrased naturally:

- “Use Cerno to analyze this PGN neutrally at depth 6.”
- “Analyze the last two public games for this Lichess username.”
- “Search Cerno's theory corpus for rook activity in rook endgames.”

For player-specific PGN coaching, include the side explicitly. Omitting it is
intentional and produces neutral full-game analysis.

## Validation procedure

Automated conformance uses the official `ClientSession`. One test starts the
actual module as a `stdio` subprocess, completes initialization, and verifies
tool discovery and schemas. In-memory protocol sessions then call every tool
while only the external Lichess, Stockfish, OpenAI, persistence, and ChromaDB
boundaries are replaced.

Manual validation on 2026-08-04 used the official client against the actual
`stdio` subprocess and local dependencies. It discovered exactly the three
documented tools, analyzed a 14-ply PGN with Stockfish at depth 1, returned two
accepted endgame-study results from the local index, produced a controlled
`invalid_pgn` error, and analyzed one public game for `PSM12` with three
weaknesses and two related studies. No OpenAI key or database was used.

Run the focused validation with:

```powershell
venv\Scripts\python.exe -m pytest -q tests\test_mcp.py
```

For a manual host check:

1. configure and restart Codex;
2. confirm the three tools through `/mcp`;
3. call `analyze_pgn` with a short legal PGN;
4. call `analyze_lichess_player` with a public username;
5. call `search_chess_theory` with an English chess query;
6. send an invalid PGN and verify the controlled `invalid_pgn` result.

## Local-version limitations

- The host must run on the same machine and can access only that machine's
  configured Stockfish and Chroma index.
- Each host starts its own server process; there is no shared remote service,
  authentication, quota, or cross-process concurrency policy.
- Lichess availability and rate limits still affect player analysis.
- Theory quality is bounded by the local English corpus and its calibrated
  abstention policy.
- Full-game board playback data is intentionally excluded from compact MCP
  results; the REST/frontend contract continues to own that viewer payload.
- Remote transport and its security controls belong to a later phase and have
  not been started.
