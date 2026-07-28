# Cerno MCP integration plan

**Status:** Approved target design for Phase 6
**Current capability:** No MCP server exists
**Last reviewed:** 2026-07-28

## 1. Purpose

MCP will expose stable Cerno capabilities to compatible external hosts. It is an integration interface, not a replacement for the REST API, the frontend, or Cerno's application services.

The implementation must use the official protocol and a supported SDK version selected at implementation time.

## 2. Current state

Cerno currently has:

- REST endpoints;
- shared service functions with varying degrees of coupling;
- an OpenAI-specific function-calling agent.

Cerno does not currently have:

- an MCP SDK dependency;
- an MCP server;
- MCP initialization or capability negotiation;
- `tools/list`;
- `tools/call`;
- MCP resources or prompts;
- `stdio` or Streamable HTTP transport;
- an MCP client test;
- MCP Inspector evidence.

The JSON tool definitions in [`app/services/agent.py`](../app/services/agent.py) are internal OpenAI function calling and must continue to be described that way.

## 3. Product purpose

Approved use case:

```text
External MCP host
  -> discovers Cerno tools
  -> submits PGN or player request
  -> Cerno uses shared application services
  -> host receives structured chess analysis
  -> host decides how to present or reason over it
```

Potential hosts include compatible coding assistants, chat assistants, and IDE integrations. Compatibility with each named host must be verified rather than assumed.

## 4. Preconditions

Phase 6 starts only after:

- Phase 1 player correctness is complete;
- Phase 2 protects core services and contracts;
- Phase 3 defines retrieval evidence and no-answer;
- Phase 4 defines generated-output contracts where generation is involved;
- Phase 5 exposes bounded, typed shared tools.

MCP must not become a second implementation of chess analysis.

## 5. Target layering

```mermaid
flowchart LR
    REST["REST adapter"] --> App["Shared application services"]
    Agent["OpenAI agent adapter"] --> App
    MCP["MCP adapter"] --> App

    App --> Engine["Stockfish adapter"]
    App --> Lichess["Lichess adapter"]
    App --> Retrieval["RAG adapter"]
    App --> DB["Repositories"]
    App --> LLM["LLM adapter"]
```

The MCP adapter owns:

- protocol schemas;
- tool/resource registration;
- transport;
- MCP error mapping;
- MCP authorization context;
- progress/cancellation mapping.

It does not own:

- Stockfish calculation;
- player projection;
- weakness aggregation;
- retrieval logic;
- persistence logic;
- prompt construction.

## 6. Initial tools

Final JSON Schemas are approved during implementation after application contracts stabilize.

### 6.1 `analyze_pgn`

Purpose: analyze an explicitly supplied PGN without implicit persistence.

Candidate input:

```json
{
  "pgn": "string",
  "depth": 8,
  "player_color": "white | black | null",
  "language": "en"
}
```

Contract rule:

- without `player_color`, return full-game engine analysis and do not label errors as belonging to a specific player;
- with `player_color`, add a player-specific projection while preserving full plies;
- `save` is absent or false in the initial tool.

Candidate output:

- full move list;
- FEN before/after;
- evaluations and classifications;
- optional player projection;
- phase statistics;
- personal critical moments only when color is known;
- structured warnings;
- analysis/schema version.

This clarification resolves an ambiguity in the master brief: a standalone PGN does not identify "the player" by itself. The exact public field name remains subject to Phase 6 schema review.

### 6.2 `search_chess_theory`

Purpose: retrieve cited chess theory from the approved index.

Candidate input:

```json
{
  "query": "string",
  "phase": "opening | middlegame | endgame | null",
  "category": "string | null",
  "top_k": 3,
  "language": "en"
}
```

Candidate output:

- `evidence_found` or `insufficient_evidence`;
- bounded passages;
- source IDs and public URLs;
- phase/category metadata;
- scores with documented meaning;
- retrieval/index version.

### 6.3 `analyze_lichess_user`

Purpose: analyze recent public games through shared Lichess and coach services.

Candidate input:

```json
{
  "username": "string",
  "limit": 3,
  "depth": 8,
  "language": "en",
  "save": false
}
```

Rules:

- `save=false` by default;
- limits are clamped by application policy;
- rate-limit errors remain structured;
- only the user's plies drive the profile;
- full games remain available in the analysis response where size limits allow;
- large results may require a bounded summary plus resource/reference strategy.

### 6.4 `get_player_weakness_profile`

Purpose: read an existing persisted profile.

Candidate input:

- username or future internal player identifier.

Rules:

- read-only;
- authorization required if the approved data policy treats profiles as private;
- absence returns a structured not-found result;
- no implicit analysis is triggered.

## 7. Excluded initial tools

Do not expose:

- `index_study`;
- index reconciliation mutation;
- arbitrary SQL;
- delete/reset operations;
- generic filesystem/network access;
- implicit save;
- unrestricted prompt execution.

RAG indexing is an administrative operation and remains outside the public MCP tool surface.

## 8. Resources

Resources are optional after initial tools are stable.

Candidate URIs:

```text
cerno://players/{username}/weakness-profile
cerno://players/{username}/analyses/{analysis_id}
cerno://theory/studies/{study_id}/chapters/{chapter_id}
```

Resource design requirements:

- stable URI semantics;
- bounded payloads;
- content type;
- authorization checks;
- not-found behavior;
- no leakage of internal-only fields;
- pagination or references for large histories.

The first MCP release may contain tools only.

## 9. MCP prompts

MCP prompts are not required for the first release. If added later, they should guide user-controlled workflows and reuse the versioned prompt assets from Phase 4 rather than duplicate prompt text.

## 10. Transport sequence

### 10.1 Local `stdio`

First implementation:

- server launched as a subprocess;
- protocol messages only on stdout;
- diagnostic logs on stderr;
- credentials from environment when needed;
- bind no network port;
- provide a sample host configuration.

This is the first conformance and product-value milestone.

### 10.2 Streamable HTTP

Second implementation:

- supported single MCP endpoint;
- controlled local/test deployment first;
- explicit lifecycle and stateless/stateful decision;
- Origin validation;
- HTTPS for remote use;
- authentication and authorization;
- per-user/tool quotas;
- request/session limits;
- observability.

Phase boundary:

- Phase 6 may implement and test Streamable HTTP in a controlled environment.
- It must not be described or deployed as production-ready until Phase 7 security and operational acceptance criteria pass.

This resolves the overlap between the master brief's Phase 6 transport work and Phase 7 security work.

## 11. Authorization and safety

### Local server

- use environment-provided credentials;
- document least-privilege setup;
- never print secrets to stdout;
- avoid exposing admin tools.

### Remote server

- use the approved MCP authorization model;
- validate token audience and scopes;
- use HTTPS;
- validate Origin;
- define read versus compute versus mutation scopes;
- authenticate access to persisted profiles;
- enforce per-tool limits;
- reject oversized PGN/messages;
- redact tokens and private content.

Human confirmation should remain possible for expensive or mutating operations. The initial public tool set is intentionally non-mutating.

## 12. Long-running operations

Stockfish and multi-game analysis can be slow.

The MCP adapter must map application support for:

- timeout;
- cancellation;
- progress notification where appropriate;
- partial failure;
- rate limiting;
- bounded result size.

Do not add background jobs solely for MCP. First measure current duration and share the same job/cancellation abstraction with REST if one is needed.

## 13. Error contract

Map application errors into stable MCP results:

- invalid PGN;
- unsupported player identity;
- Lichess user not found;
- Lichess rate limited;
- Stockfish unavailable;
- analysis timeout;
- retrieval insufficient evidence;
- retrieval unavailable;
- profile not found;
- unauthorized/forbidden;
- internal error with safe message.

Do not return raw stack traces, provider bodies, secrets, or internal filesystem paths.

## 14. Client and conformance testing

### 14.1 Automated client tests

Using the official SDK:

1. start server;
2. initialize session;
3. assert declared capabilities;
4. call `tools/list`;
5. snapshot approved names and schemas;
6. call each tool with a deterministic fixture;
7. assert structured content;
8. close cleanly.

### 14.2 Negative tests

- missing required argument;
- wrong enum/type;
- oversized PGN;
- invalid PGN;
- depth outside policy;
- unauthorized profile;
- timeout;
- cancellation;
- Lichess 429;
- missing Chroma/Stockfish;
- unknown tool;
- attempt to discover administrative indexing.

### 14.3 Transport tests

- `stdio` contains no non-protocol stdout;
- process shutdown is clean;
- Streamable HTTP supports initialization and calls;
- invalid Origin rejected;
- authorization failures return the correct status;
- concurrent sessions respect limits.

### 14.4 MCP Inspector

Record a manual verification:

- connection parameters;
- protocol/SDK version;
- tools discovered;
- sample calls;
- error call;
- date and environment.

Inspector evidence supplements automated tests.

## 15. Documentation deliverables

- server installation;
- local `stdio` configuration;
- environment variables;
- tool contracts and examples;
- error behavior;
- limits and persistence defaults;
- client example;
- Inspector procedure;
- remote deployment and authorization guide when applicable;
- compatibility matrix for tested hosts.

## 16. Claims policy

Before Phase 6:

> Cerno uses internal OpenAI function calling. It does not yet implement MCP.

After local MCP acceptance:

> Cerno exposes a protocol-compliant local MCP server with discoverable chess-analysis tools over stdio.

After remote Phase 7 acceptance:

> Cerno exposes an authenticated Streamable HTTP MCP service for approved external clients.

Do not claim that the internal agent uses MCP unless its actual call path is deliberately changed and verified.

## 17. Open decisions for Phase 6

- Exact SDK stable version and pin.
- Final `analyze_pgn` player-context field.
- Maximum PGN/result size.
- Whether large full-game outputs become resources.
- Public/private policy for player profiles.
- Whether language belongs in engine tools or only generation tools.
- Whether Streamable HTTP is mounted in the existing ASGI process or a separate service.
- Tested host compatibility list.

These decisions require implementation-time verification and decision-log updates.

## 18. Phase 6 acceptance criteria

Phase 6 is complete when:

- application logic is shared with REST/agent;
- local `stdio` server initializes with the official client;
- approved tools are discoverable and callable;
- administrative indexing is absent;
- analysis defaults to no persistence;
- standalone PGN output makes no unsupported player attribution;
- schemas and structured errors are tested;
- timeout and cancellation behavior is tested;
- MCP Inspector verification is documented;
- sample client/configuration exists;
- any Streamable HTTP implementation remains non-production until Phase 7 gates pass.
