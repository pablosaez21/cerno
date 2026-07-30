# Cerno decision log

**Status:** Living architecture decision record
**Last reviewed:** 2026-07-29

## 1. How to use this log

Each material decision records:

- problem;
- decision;
- alternatives;
- rationale;
- impact;
- required tests/evidence;
- status.

Statuses:

- **Accepted:** approved direction.
- **Proposed:** needs explicit approval.
- **Open:** information or choice is missing.
- **Superseded:** replaced by a later decision.

## 2. Decisions

### DEC-001 — Professionalization follows a fixed phase order

**Status:** Accepted

**Problem:** Broad simultaneous changes would make Cerno difficult to verify and explain.

**Decision:** Use:

```text
0 documentation
1 correctness
2 quality foundation
3 RAG
4 prompts
5 agent
6 MCP
7 security/operations
```

**Alternatives:** One large rewrite; implement MCP first; improve RAG before correcting player statistics.

**Rationale:** Every later capability depends on correct player data and automated constraints.

**Impact:** A later phase cannot start merely because related code is convenient to edit.

**Evidence:** Phase acceptance review.

### DEC-002 — Preserve full games but derive player-only coaching data

**Status:** Accepted

**Problem:** Current aggregation mixes player and opponent plies.

**Decision:** Preserve all plies for review and build a separate player-specific projection for metrics, personal critical moments, RAG queries, and coaching.

**Alternatives:** Remove opponent plies from analysis; keep current aggregation; infer ownership only in the frontend.

**Rationale:** The viewer requires the full game, while coaching requires player truth.

**Impact:** Move ownership must be explicit or unambiguous in application contracts.

**Tests:** White and Black player regressions; opponent-only blunder; full-ply viewer count.

### DEC-003 — Best-phase claims require evidence

**Status:** Accepted

**Problem:** Current normalized stats omit `moves` while best-phase detection requires it.

**Decision:** Restore a coherent contract during Phase 1 and exclude phases without sufficient evidence.

**Alternatives:** Always choose the minimum CPL; retain the current no-result behavior silently.

**Rationale:** A zero-value empty phase is not a demonstrated strength.

**Impact:** Normalized phase schema or best-phase logic changes, with contract tests.

**Tests:** Strong opening with evidence; empty phase excluded; all-empty input yields no invented strength.

### DEC-004 — Tests constrain intended behavior, not existing bugs

**Status:** Accepted

**Problem:** Regression tests can accidentally legitimize incorrect behavior.

**Decision:** Define the expected contract first. Do not weaken assertions, remove tests, or mock the logic being verified to make implementation pass.

**Alternatives:** Snapshot current output before defining semantics.

**Rationale:** Test volume without correct oracles creates false confidence.

**Impact:** Phase 1 tests encode player-only behavior even though current code fails it.

### DEC-005 — Every critical adapter needs real integration evidence

**Status:** Accepted

**Problem:** Current tests largely mock Stockfish, PostgreSQL, ChromaDB, and generation boundaries.

**Decision:** Keep mocks for isolated tests and add real automated integration paths for critical adapters.

**Alternatives:** Only E2E; only mocks; live external APIs on every PR.

**Rationale:** Integration failures occur outside pure application logic, while live providers are too variable for every PR.

**Impact:** Phase 2 CI includes local Stockfish, PostgreSQL, and temporary Chroma.

### DEC-006 — Current RAG is retrieval-assisted, not fully grounded

**Status:** Accepted

**Problem:** Retrieved source records are shown, but the structured coach passes only derived themes to generation.

**Decision:** Describe current behavior accurately. Claim grounded RAG only after bounded retrieved passages reach the generator and citations are validated.

**Alternatives:** Treat any vector search as fully grounded RAG.

**Rationale:** Grounding is an evidence-flow property, not a dependency label.

**Impact:** Public architecture and claims distinguish current and target state.

### DEC-007 — Retrieval must support insufficient evidence

**Status:** Accepted

**Problem:** Nearest-neighbor retrieval always produces a result, including misleading endgame matches from opening material.

**Decision:** Add a calibrated `insufficient_evidence` outcome in Phase 3.

**Alternatives:** Always display top-k; select an arbitrary manual threshold now.

**Rationale:** Abstention is safer than false authority.

**Impact:** Retrieval, coach, prompts, frontend, REST, and MCP must support an explicit status.

**Tests/evidence:** Golden positive/negative dataset; no-answer precision and recall.

### DEC-008 — Advanced retrieval remains measurement-gated

**Status:** Accepted

**Problem:** GraphRAG, HyDE, ColBERT, multi-query, and agentic retrieval can add complexity before basic data quality is solved.

**Decision:** First implement corpus balance, manifest, chunking, evaluation, filters, and no-answer. Add advanced techniques only for a measured failure mode.

**Alternatives:** Adopt a fashionable architecture immediately.

**Rationale:** The current bottleneck is corpus and evaluation quality.

**Impact:** Every advanced retrieval proposal needs a baseline, measured gain, cost/latency analysis, and rollback.

### DEC-009 — Prompts become versioned application assets

**Status:** Accepted

**Problem:** Prompts are inline, multi-purpose, and not versioned.

**Decision:** Separate system invariants, task prompts, and dynamic context; validate outputs with application schemas; evaluate versions before promotion.

**Alternatives:** Continue editing inline strings; introduce an external prompt platform immediately.

**Rationale:** Local versioned assets are sufficient for traceability without adding operational dependency.

**Impact:** Phase 4 adds prompt registry, schema versions, changelog, and evals.

### DEC-010 — Retrieved content is untrusted data

**Status:** Accepted

**Problem:** PGN comments and study text can contain instructions.

**Decision:** Keep untrusted content outside instruction layers, label it as data, limit it, and test prompt injection.

**Alternatives:** Rely only on a prompt sentence; strip all comments and lose useful theory.

**Rationale:** Preserve useful content without granting it authority.

**Impact:** Ingestion, prompt construction, agent tools, and MCP results need clear data boundaries.

### DEC-011 — The structured coach remains the primary product flow

**Status:** Accepted

**Problem:** The experimental agent is less bounded and has an unbounded tool loop.

**Decision:** Keep the structured coach primary. Harden the agent later and require a clear product role before expanding it.

**Alternatives:** Replace the coach with the agent.

**Rationale:** The structured pipeline has clearer contracts and failure behavior.

**Impact:** Phase 5 does not force a product migration to chat.

### DEC-012 — MCP is a thin external adapter

**Status:** Accepted

**Problem:** Adding MCP could duplicate REST and agent business logic.

**Decision:** REST, agent, and MCP call shared application services. MCP owns protocol and transport only.

**Alternatives:** Independent MCP implementation; route MCP through REST internally.

**Rationale:** Shared services avoid behavioral drift and unnecessary network hops.

**Impact:** Phase 5 service extraction precedes Phase 6.

### DEC-013 — Internal function calling is not MCP

**Status:** Accepted

**Problem:** JSON tool definitions can be mistaken for MCP.

**Decision:** Describe current agent behavior as OpenAI function calling. Claim MCP only after server initialization, discovery, calls, transport, client tests, and documentation exist.

**Impact:** Architecture, public claims, and interview explanations remain accurate.

### DEC-014 — Initial MCP analysis is non-persistent

**Status:** Accepted

**Problem:** A model-controlled analysis tool should not create durable user state unexpectedly.

**Decision:** Analysis defaults to `save=false`. Persistence, if later exposed, is explicit and separately authorized.

**Alternatives:** Mirror REST options without a safer default.

**Rationale:** Least surprise and easier security review.

**Tests:** Tool default and no-write integration test.

### DEC-015 — RAG indexing is not a public MCP tool

**Status:** Accepted

**Problem:** Indexing mutates the knowledge base and can enable resource abuse or poisoning.

**Decision:** Keep indexing administrative and protected; omit it from initial MCP discovery.

**Impact:** `tools/list` tests assert that index mutation is absent.

### DEC-016 — MCP starts with local stdio

**Status:** Accepted

**Problem:** Remote transport adds authorization, network, and operational concerns.

**Decision:** Prove protocol and product value over `stdio`, then add Streamable HTTP.

**Alternatives:** Remote-first implementation.

**Rationale:** Local transport reduces variables while tools and schemas stabilize.

**Impact:** Official client and Inspector verification begin locally.

### DEC-017 — Streamable HTTP production readiness belongs to Phase 7

**Status:** Accepted

**Problem:** The master brief places Streamable HTTP in Phase 6 but repeats authentication and limits in Phase 7.

**Decision:** Phase 6 may implement and test the transport in a controlled environment. Production exposure requires Phase 7 authorization, Origin, HTTPS, quotas, observability, and operations gates.

**Impact:** No contradiction in completion claims: transport implemented does not mean production-ready.

### DEC-018 — Standalone PGN analysis is player-neutral by default

**Status:** Accepted as a semantic invariant; public schema remains open

**Problem:** The proposed `analyze_pgn` MCP output mentions "player errors," but a standalone PGN input does not identify the player.

**Decision:** Return full-game analysis by default. Produce a player-specific projection only when caller supplies explicit player context.

**Alternatives:** Assume White; infer from arbitrary header username; call every error a player error.

**Rationale:** Avoid unsupported attribution.

**Open detail:** Final field may be `player_color`, player name, or a typed player selector.

### DEC-019 — Security controls are shared across interfaces

**Status:** Accepted

**Problem:** REST, agent, and MCP expose overlapping expensive or sensitive capabilities.

**Decision:** Application-level policy owns limits and authorization decisions; each interface maps its own transport/auth context into that policy.

**Impact:** MCP does not receive unique business limits that drift from REST.

### DEC-020 — Move ownership is explicit at the engine boundary

**Status:** Accepted and implemented in Phase 1

**Problem:** Deriving ownership only inside the coach would leave the shared
full-game contract ambiguous and encourage different interfaces to repeat parity
or FEN inference.

**Decision:** Every Stockfish move and critical-moment record includes
`mover_color` with the value `white` or `black`. Player projection validates this
field and fails closed if ownership is missing or invalid.

**Alternatives:** Infer by list parity; inspect FEN separately in every consumer;
add ownership only to the coach response.

**Rationale:** Ownership is known exactly before the move is pushed and is
therefore cheapest and most reliable at the engine boundary.

**Impact:** `/games/analyze` and nested coach move records gain an additive field;
frontend types and move grouping consume it directly.

**Evidence:** Stockfish output-contract test, real Docker Stockfish smoke, frontend
lint, and production build.

### DEC-021 — Phase evidence is represented by the normalized move count

**Status:** Accepted and implemented in Phase 1

**Problem:** `detect_best_phase` required `moves`, but normalization discarded it.
Selecting a zero-CPL empty phase would invent a relative strength.

**Decision:** Preserve `moves` in normalized phase statistics. A phase is eligible
for the current relative comparison when it contains at least one analyzed player
move; phases with zero or missing move count are excluded. The eligible phase with
the lowest average CPL is selected.

**Alternatives:** Recount moves in the coach; always choose minimum CPL; introduce
an arbitrary multi-move confidence threshold.

**Rationale:** Preserving an already-computed count restores the existing contract
without duplication. A higher confidence threshold requires product evidence and
is not invented during correctness work.

**Impact:** `diagnosis.phase_stats` gains additive `moves`; no-evidence inputs
produce no best-phase claim.

**Evidence:** Aggregation contract and best-phase regression tests.

### DEC-022 — Unknown player identity fails closed

**Status:** Accepted and implemented in Phase 1

**Problem:** The previous coach code treated any username not matching White as
Black, which could make unsupported player-specific claims for malformed or
unexpected game metadata.

**Decision:** Resolve both participants case-insensitively and accept exactly one
match. A game with no match or an ambiguous double match is skipped before
Stockfish analysis. If no valid games remain, the existing controlled
`No games could be analyzed` error is returned.

**Alternatives:** Assume Black; analyze and mix both players; infer identity from
the PGN header independently of the structured Lichess record.

**Rationale:** Player-specific coaching must never guess identity.

**Impact:** Malformed Lichess game metadata cannot create a personal profile.

**Evidence:** Endpoint regression proving the engine is not called.

### DEC-023 — Ruff is the single Python style tool

**Status:** Accepted and implemented in Phase 2A

**Problem:** The repository had no Python lint or format contract. Adding
independent tools for linting, import sorting, and formatting would create
overlapping configuration and CI steps.

**Decision:** Pin Ruff 0.16.0 for linting, import sorting, modernization checks,
and formatting. Use Python 3.13 as the target. Exempt `B008` globally because
FastAPI intentionally constructs dependency and body declarations in function
defaults. Scope `E402` exceptions only to bootstrap files that must initialize
the environment or path before application imports.

**Alternatives:** Flake8 plus isort plus Black; pylint plus Black; no formatter
gate.

**Rationale:** One tool provides fast, deterministic local and CI behavior while
keeping exceptional framework patterns visible and documented.

**Impact:** Existing Python files received mechanical import and formatting
normalization. No lint family is silently disabled through a broad file
exclusion.

**Evidence:** `ruff check app tests scripts` and `ruff format --check app tests
scripts` both pass; 48 files are formatted.

### DEC-024 — mypy uses a gradual repository-wide boundary

**Status:** Accepted and implemented in Phase 2A

**Problem:** The backend had strict-looking annotations in places but no
executable static type contract. Enabling every strict mypy flag immediately
would encourage exclusions or broad ignores instead of useful adoption.

**Decision:** Pin mypy 2.3.0 and check all modules under `app/` and `scripts/`
with `check_untyped_defs`, `no_implicit_optional`, and diagnostic warnings.
Do not use module exclusions, `ignore_missing_imports`, global error-code
suppression, or the deprecated SQLAlchemy mypy plugin. Narrowly type or cast
dynamic third-party SDK boundaries.

**Alternatives:** Pyright; strict mypy with broad exclusions; mypy only on new
files; SQLAlchemy's deprecated plugin.

**Rationale:** This makes existing function bodies part of the gate while
allowing annotations to improve incrementally and preserving SQLAlchemy 2's
native `Mapped` typing.

**Impact:** Thirteen pre-existing type errors across seven modules were resolved
with annotations, accurate return types, and narrow SDK-boundary casts. The RAG
and agent product behavior was not redesigned.

**Evidence:** `mypy app scripts --no-incremental` reports success for 36 source
files, with no `# type: ignore` additions or ignored modules.

### DEC-025 — The initial coverage gate is the measured 70% floor

**Status:** Accepted and implemented in Phase 2A

**Problem:** There was no official line or branch measurement. Choosing an
aspirational threshold without a baseline would either fail immediately or
encourage low-value tests.

**Decision:** Measure `app/` with branch coverage and no source omissions. The
initial `fail_under` value is 70%, based on the existing suite's 70.06% combined
result. Report line and branch figures separately and generate terminal, XML,
and HTML reports.

**Alternatives:** No threshold; line-only coverage; an arbitrary 80% threshold;
adding trivial tests solely to raise the baseline.

**Rationale:** A floor with 0.06 percentage points of margin prevents immediate
regression while making the serious gaps in repositories, RAG, and the agent
explicit.

**Impact:** New uncovered production code will normally require relevant tests.
The floor must rise only with meaningful Phase 2B/2C evidence.

**Evidence:** 755/1,028 lines (73.44%), 111/208 branches (53.37%), 70.06%
combined, and 33 passing tests.

### DEC-026 — Quality commands are shared by local development and CI

**Status:** Accepted and implemented in Phase 2A

**Problem:** Platform-specific shell snippets drift easily, and production
requirements previously included test and build tooling.

**Decision:** Keep runtime packages in `requirements.txt`, pin quality and build
packages in `requirements-dev.txt`, and use `scripts/quality.py` as the
cross-platform command dispatcher. GitHub Actions invokes the same targets in
separate backend and frontend jobs. A local validator checks workflow YAML and
required commands without claiming to execute a hosted runner.

**Alternatives:** Makefile-only commands; duplicate commands in documentation and
CI; keep pytest/build tooling in the production image.

**Rationale:** A small Python dispatcher works on Windows and Linux and reduces
the gap between local verification and the pull-request gate.

**Impact:** Production installs no longer include pytest or Python packaging
build tools. Frontend adds an explicit `typecheck` script. Hosted workflow
behavior for the Phase 2A jobs was subsequently verified.

**Evidence:** `python scripts/quality.py all`, `pip check`, and the local workflow
validator pass; the backend and frontend jobs are green in GitHub Actions.

### DEC-027 — Real PostgreSQL tests use a dedicated disposable database

**Status:** Accepted and implemented locally in Phase 2B

**Problem:** Repository and transaction behavior was only exercised through
mocks. Reusing the ordinary Compose database would risk destroying developer
data when resetting schemas.

**Decision:** Use PostgreSQL 16 directly, never SQLite. Locally,
`docker-compose.integration.yml` exposes an ephemeral `cerno_test` database on
port 55432 under a distinct Compose project. GitHub Actions provides the same
database through a service container. Fixtures accept only a local database
named exactly `cerno_test`, reject Cerno's configured application URL, recreate
`public`, run Alembic to `head`, and clean it after every case.

**Alternatives:** SQLite; Testcontainers; reuse the development database; one
shared dirty schema for the whole test run.

**Rationale:** A small dedicated Compose/service-container setup is explicit,
works from Windows and Linux, and permits real commits while retaining a strong
destructive-operation guard.

**Impact:** Six integration cases cover migration, repositories, JSONB,
relationships, foreign keys, replacement/upsert, full commit, and rollback.

**Evidence:** `python scripts/quality.py postgres` reports six passing cases
against PostgreSQL 16.

### DEC-028 — Timestamp nullability drift is repaired by migration 0002

**Status:** Accepted and implemented locally in Phase 2B

**Problem:** Real autogeneration comparison found eight timestamp columns that
the ORM treats as non-nullable but migration `0001` created as nullable.

**Decision:** Preserve the ORM contract. Migration
`0002_timestamp_columns_not_null` fills historical null values with `now()` and
then makes those timestamp columns non-nullable. Do not rewrite already-applied
`0001`.

**Alternatives:** Make ORM timestamps optional; edit `0001`; ignore the drift.

**Rationale:** Every affected timestamp already has a server default and is used
as present by ordering and response code. A forward migration is safe for
existing databases and reproducible for empty ones.

**Impact:** Deployments apply one additive schema migration. Downgrade restores
nullable columns but does not recreate historical null values.

**Evidence:** Empty PostgreSQL upgrades through `0002`, expected tables and
revision exist, and Alembic `compare_metadata` returns no differences.

### DEC-029 — Chroma initialization is lazy and injectable

**Status:** Accepted and implemented locally in Phase 2B

**Problem:** Importing `app.services.rag` immediately opened the developer's
persistent index, preventing an integration test from proving it used only
temporary storage.

**Decision:** Add a collection factory accepting path, name, and embedding
function; cache the default product collection lazily; and allow indexing/search
helpers to receive an explicit collection. Product callers retain their existing
signatures and default behavior.

**Alternatives:** Monkeypatch module globals after import; copy RAG logic into
tests; use the developer index; rewrite retrieval.

**Rationale:** Dependency injection at the storage boundary is the smallest
change that guarantees isolation without changing retrieval behavior.

**Impact:** Four real Chroma cases use pytest temporary directories and
deterministic embeddings. Source reconciliation, stale-chunk deletion, and
semantic improvements remain Phase 3 work.

**Evidence:** Temporary persistence, metadata, retrieval, idempotent upsert,
reopen, empty index, and controlled unavailable-path behavior pass.

### DEC-030 — Stockfish tests inject the executable path and assert invariants

**Status:** Accepted and implemented locally in Phase 2B

**Problem:** The executable path was frozen during module import and engine
behavior was normally mocked, making Windows/Linux integration awkward.

**Decision:** Keep the existing configured default while allowing an optional
path at the analysis boundary. Tests resolve an explicit local/CI binary, run at
depth 1, and assert structural chess invariants rather than exact centipawn
values.

**Alternatives:** Commit a binary; mock the engine; assert exact engine scores;
require a platform-specific hard-coded path.

**Rationale:** An injected path is deterministic across operating systems and
does not alter product callers. Stable invariants tolerate packaged Stockfish
version differences.

**Impact:** Eight real-engine cases cover ownership, FEN, CPL, phase,
classification, castling, en passant, promotion, mate, custom FEN, invalid PGN,
and missing binary errors.

**Evidence:** `python scripts/quality.py stockfish` reports eight passing cases
with the ignored Windows executable.

### DEC-031 — Frontend confidence uses behavior-first layered tests

**Status:** Accepted and implemented locally in Phase 2C

**Problem:** The frontend had only lint, TypeScript, and build validation.
Failures in request serialization, async states, PGN/FEN reconstruction,
orientation, accessibility semantics, or board navigation could reach users.

**Decision:** Use Vitest with React Testing Library for deterministic and
component behavior, MSW with unexpected requests rejected, `vitest-axe` for
basic DOM accessibility checks, and Playwright for browser flows. Keep unit
tests independent from CSS classes and massive snapshots. Include every module
under `src/components` and `src/lib` in coverage, excluding only tests/fixtures.

**Alternatives:** Jest in parallel with Vitest; snapshot-heavy testing; only
Playwright; mocking the entire backend in browser tests.

**Rationale:** The layers localize failures while retaining one real full-stack
path. They are compatible with Next 16, React 19, Node 24, and the existing
board dependencies.

**Impact:** Sixty-four Vitest cases establish a measured 95.72% statement,
83.21% branch, 95.61% function, and 98.21% line baseline. Non-regression floors
of 92%, 80%, 90%, and 95% apply respectively. The API client and GameViewer
remain included.

**Evidence:** Separate unit/component/coverage commands, strict MSW setup, eight
axe checks, and local passing coverage.

### DEC-032 — Browser E2E replaces only the external Lichess boundary

**Status:** Accepted and implemented locally in Phase 2C

**Problem:** Live Lichess is rate-limited and variable, while mocking the
frontend API would not prove compatibility among the browser, FastAPI, coach,
player projection, and engine.

**Decision:** Add `LICHESS_API_BASE_URL`, defaulting to
`https://lichess.org`, at the existing Lichess adapter. Playwright starts a local
NDJSON fixture server for that URL, a production Next build, and FastAPI with a
real depth-1 Stockfish. OpenAI uses the existing local fallback, saving is
disabled, and Chroma uses a temporary empty directory removed by the runner.

**Alternatives:** Contact live Lichess in every pull request; mock
`/coach/analyze-user` in the browser; use the developer database/index; require
Docker for all browser tests.

**Rationale:** This is the narrowest deterministic seam that keeps the internal
application and public contracts real on both Windows and Ubuntu.

**Impact:** Four Chromium cases cover PGN success, Lichess success and player
orientation, controlled Lichess 404, and invalid PGN recovery. Failure artifacts
include HTML, trace, screenshot, and retained video. The production default and
REST contract are unchanged.

**Evidence:** `npm run test:e2e:only` reports four passing cases and the wrapper
leaves no owned temporary directory or listening process.

### DEC-033 — Pasted PGN coaching is explicitly full-game

**Status:** Superseded for the product UI by DEC-034; retained as the low-level
REST contract

**Problem:** `POST /games/analyze` returned only Stockfish moves and metrics, so
the PGN frontend could render a board but no explanation or recommendation. A
pasted PGN also does not establish which color belongs to the user.

**Decision:** Extend the existing PGN response additively with
`coaching.scope = "full_game"`, a non-empty engine-grounded explanation, and at
least one review recommendation. Build it from the already-computed Stockfish
analysis without a second engine run, RAG, OpenAI, persistence, or guessed
player color. Keep Lichess diagnosis player-specific and unchanged.

**Alternatives:** Send PGN through the Lichess username flow; guess White as the
user; require a new player-color UI selector; call the experimental agent; show
generic frontend-only copy.

**Rationale:** The additive contract repairs the missing output while preserving
the repository invariant that full-game viewer data and player-specific
diagnosis are separate. A future explicit player selector can add a
player-specific projection without changing this neutral default.

**Impact:** The PGN report now renders a coach reading and recommendations
before the existing board. Endpoint, component, API, accessibility, and browser
regressions require coaching content while retaining complete move navigation.

**Evidence:** The real depth-1 PGN response contains six plies, a
`full_game` explanation, and two recommendations. The four Chromium scenarios
remain green, including the controlled Lichess success/error flows.

### DEC-034 — PGN and Lichess share one coaching report

**Status:** Accepted and implemented as a Phase 2C regression correction

**Problem:** Although DEC-033 restored coaching copy to pasted PGN, it created a
second result hierarchy with different headings, metrics, and sections. The
Lichess form rendered the structured player coach while PGN rendered the
low-level engine report. This made the product change substantially depending
on how the same game entered the application.

**Decision:** Keep `/games/analyze` as a compatible low-level full-game
endpoint. Add `/coach/analyze-pgn`, require an explicit White/Black player
selection, and route that game through the same player projection, weakness
aggregation, theory retrieval, training generation, and response schema as
`/coach/analyze-user`. Render both results with `CoachResults`. Uploaded PGN
reports remain temporary and non-persistent.

**Rationale:** Lichess supplies PGN plus trusted player identity; an uploaded
PGN supplies the same game data but lacks identity. An explicit color is the
smallest missing input. Once supplied, maintaining a separate coaching service
or React result tree has no product or correctness benefit.

**Impact:** The two entry forms now differ only in source-specific input and
metadata. Both display coach reading, diagnosis, the same board review, phase
performance, player-specific critical moments, weekly plan, and theory
recommendations. The full-game move list remains separate from player-specific
diagnosis.

**Evidence:** Backend regression coverage verifies the shared response,
player-color projection, and full-game viewer data. Frontend unit and browser
coverage requires the common report structure after PGN submission and retains
the Lichess scenarios.

### DEC-035 — Phase 3 uses manifest filters plus a calibrated evidence gate

**Status:** Accepted and implemented

**Problem:** The previous nearest-neighbour call always returned documents,
including opening chapters for unsupported middlegame, endgame, and irrelevant
queries. The ignored local index also contained unexplained chunks and no
pipeline/hash metadata.

**Decision:** Make the source manifest authoritative, build bounded
`python-chess` chunks with content hashes and version metadata, and reconcile
source-local stale IDs plus manifest orphans. Retrieval returns the typed
statuses `evidence_found` and `insufficient_evidence`. Available phase/category
filters run before a dense L2 cutoff calibrated on the versioned golden set.
Existing interfaces receive the prior list shape, with abstention represented
as an empty list.

**Rationale:** The corpus is currently opening-only. Filtering can prove that
an unsupported phase has no evidence, while a measured distance gate handles
irrelevant queries with no phase terms. This solves the observed failure
without inventing sources or adding unmeasured retrieval machinery.

**Impact:** The calibrated `rag-v1` cutoff is `1.3739006519317627`. Baseline
Recall@1/Recall@3/MRR/abstention precision of `0.80/1.00/0.90/0.00` become
`1.00/1.00/1.00/1.00` on the 12-case golden set. The same dataset was used for
calibration and evaluation, so expansion and a later holdout set remain
necessary. Prompt, generation, agent, MCP, frontend, hybrid search, and
reranking behavior are unchanged.

**Evidence:** Versioned baseline, calibration, and final reports live under
`evals/results/`; technical retrieval tests use only temporary Chroma
directories.

## 3. Verified discrepancies

### 3.1 Test count: working tree versus commit

The documentation-phase audit observed 21 passing backend cases while
`tests/test_lichess.py` was untracked.

**Phase 1 verification:** At the start of Phase 1 the worktree was clean,
`tests/test_lichess.py` was tracked by `HEAD`, and the committed baseline
reproduced 21 passing cases. The earlier versioning discrepancy is therefore
resolved. The Phase 1 working tree now collects 33 cases.

### 3.2 RAG count: documentation versus local volume

`docs/rag_validation.md` records 358 chunks from 14 successful studies. The later local audit observed 360 chunks and 15 study IDs because two unexpected `lVCUmd79` chunks remain, while `6XvaoT1n` is absent.

**Resolution:** The versioned manifest is now authoritative. The read-only
Phase 3 inventory confirmed the drift. The subsequent manifest rebuild replaced
all legacy source chunks and removed the two `lVCUmd79` orphans. A final
reconciliation reported no orphan, incomplete, duplicate-hash, or
version-mismatch chunks.

### 3.3 RAG local versus production

The local index is stored under ignored `data/`. No evidence in this documentation phase proves that a production or Railway volume has identical sources, counts, or metadata.

**Resolution:** Production state remains unverified until an authorized read-only inventory is run.

### 3.4 MCP tool contract and player identity

The brief's candidate `analyze_pgn` output refers to player errors, but its input does not define the player.

**Resolution:** DEC-018 defines player-neutral default behavior; exact schema remains a Phase 6 decision.

### 3.5 MCP security appears in two phases

The brief includes Streamable HTTP auth/limits in Phase 6 and broader auth/limits in Phase 7.

**Resolution:** DEC-017 separates controlled transport implementation from production readiness.

### 3.6 Proposed Pydantic naming

The brief uses `TrainingRecommendation` as an example Pydantic output name, while the repository already has a SQLAlchemy model named `TrainingRecommendation`.

**Resolution:** Use module-qualified names or a distinct application name such as `GeneratedRecommendation`; final schema is approved in Phase 4.

### 3.7 Prompt and MCP directories

The proposed `prompts/`, `evals/`, source manifest, and MCP server files do not currently exist.

**Resolution:** They are target architecture, not current-state documentation.

## 4. Open verification items

### OQ-001 — Production RAG inventory

**Status:** Retrieval threshold resolved for `rag-v1`; advanced techniques remain open

Verify authorized production counts, source IDs, metadata completeness, model version, and volume persistence.

### OQ-002 — Player-data privacy model

**Status:** Open

Decide whether persisted profiles/analyses are public by Lichess username, private to an authenticated account, or support both modes.

### OQ-003 — Supported product languages

**Status:** Open

The visible product is English, the current experimental agent prompt is Spanish, and the target plans mention both languages. Approve supported languages and fallback behavior before prompt/MCP schema finalization.

### OQ-004 — Prompt provider structured-output capability

**Status:** Open

Select and verify the provider/model/SDK behavior during Phase 4. Pydantic application validation is required regardless.

### OQ-005 — MCP SDK/version

**Status:** Open

Select the current stable official SDK and pin it when Phase 6 begins. Do not freeze a version in advance.

### OQ-006 — MCP PGN player selector

**Status:** Open

Choose exact input: `player_color`, header player name, or a typed selector. It must never guess.

### OQ-007 — MCP result size

**Status:** Open

Measure full-game payload sizes and decide whether large results remain tool output or use resources/references.

### OQ-008 — Background jobs

**Status:** Open

Measure Stockfish and multi-game latency before deciding whether REST/MCP need a shared job queue.

### OQ-009 — CI environment

**Status:** Phase 2A/2B resolved; Phase 2C hosted verification pending

The deterministic Python 3.13, Node 24, and backend-integration jobs are green
in GitHub Actions run `30460515439`. Phase 2C locally validates Chromium,
production Next, the isolated Lichess boundary, temporary Chroma, and real
Stockfish. The expanded frontend job, new browser job, and artifact uploads
remain pending until the first push.

### OQ-010 — Retrieval thresholds and advanced techniques

**Status:** Open

The current dense L2 threshold is calibrated and versioned. No hybrid
weighting, reranker, HyDE, ColBERT, or GraphRAG choice is approved without new
evaluation evidence.

## 5. Decision review

Review this log:

- before each phase;
- when a target contract changes;
- when an optional technology is proposed;
- when implementation evidence contradicts an accepted assumption;
- before making a new public capability claim.

Superseded decisions remain in the file with a link to their replacement.
