# Cerno decision log

**Status:** Living architecture decision record
**Last reviewed:** 2026-07-28

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

## 3. Verified discrepancies

### 3.1 Test count: working tree versus commit

The brief and latest audit state that 21 backend tests pass. The current working tree supports that statement, but `tests/test_lichess.py` is untracked. The last commit alone does not contain the same suite.

**Resolution:** Documentation says "current working tree." Versioning is required before CI can reproduce the count.

### 3.2 RAG count: documentation versus local volume

`docs/rag_validation.md` records 358 chunks from 14 successful studies. The later local audit observed 360 chunks and 15 study IDs because two unexpected `lVCUmd79` chunks remain, while `6XvaoT1n` is absent.

**Resolution:** Treat the local volume as drifted, not as the intended manifest. Phase 3 owns reconciliation.

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

**Status:** Open

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

**Status:** Open

Verify Stockfish packaging/path, PostgreSQL service, Chroma model cache, browser dependencies, and runtime budgets in GitHub Actions.

### OQ-010 — Retrieval thresholds and advanced techniques

**Status:** Open

No relevance threshold, hybrid weighting, reranker, HyDE, ColBERT, or GraphRAG choice is approved without evaluation results.

## 5. Decision review

Review this log:

- before each phase;
- when a target contract changes;
- when an optional technology is proposed;
- when implementation evidence contradicts an accepted assumption;
- before making a new public capability claim.

Superseded decisions remain in the file with a link to their replacement.
