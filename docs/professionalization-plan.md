# Cerno professionalization plan

**Status:** Approved implementation sequence
**Last reviewed:** 2026-07-28

## 1. Objective

Professionalization means making Cerno more correct, understandable, measurable, and safe to evolve. It does not mean adding technologies for presentation value.

Every phase must:

1. start from a verified current-state description;
2. define expected behavior and invariants;
3. make small, reviewable changes;
4. add evidence at the appropriate test layer;
5. update relevant documentation;
6. satisfy its acceptance criteria before the next phase begins.

The detailed technical designs are linked from each phase. This document owns implementation order and phase completion criteria.

## 2. Status terminology

- **Current state:** behavior verified in the repository or local environment.
- **Identified limitation:** a known gap that is not yet fixed.
- **Confirmed bug:** behavior contradicted by the intended product contract.
- **Approved decision:** a direction accepted for future implementation.
- **Target architecture:** intended end state, not a current capability.
- **Optional improvement:** introduced only when evidence justifies it.
- **Acceptance criterion:** observable evidence required to close a phase.

## 3. Phase order

```text
Phase 0: documentation and verification
Phase 1: product correctness
Phase 2: automated quality foundation
Phase 3: RAG professionalization
Phase 4: prompt engineering
Phase 5: agent hardening
Phase 6: MCP implementation
Phase 7: security, observability, and operations
```

This order is authoritative. A proposed deviation must be entered in [decision-log.md](./decision-log.md), justified, and explicitly approved before implementation.

## 4. Phase 0 — Documentation and verification

### Objective

Create a shared, technically accurate plan before modifying implementation.

### Deliverables

- repository-level `AGENTS.md`;
- current and target architecture;
- phased professionalization plan;
- testing strategy;
- RAG improvement plan;
- prompt engineering plan;
- MCP integration plan;
- decision log.

### Acceptance criteria

- All required documents exist and link to each other.
- Current capabilities are separated from target capabilities.
- The two correctness bugs are documented.
- Internal OpenAI function calling is not presented as MCP.
- Semantic retrieval is not presented as fully grounded generation.
- Contradictions and open questions are recorded.
- No code, tests, dependencies, migration, configuration, infrastructure, or README changes are part of the phase.

## 5. Phase 1 — Product correctness

**Status:** Complete as of 2026-07-28

### Objective

Ensure that Cerno's coaching describes the player's play rather than a mixture of both players, and restore coherent best-phase detection.

### Scope

1. Make mover color explicit or derive it unambiguously.
2. Preserve every ply for game review.
3. Build player-specific metrics from the player's plies only.
4. Build personal critical moments from the player's plies only.
5. Ensure RAG queries and recommendations use the corrected profile.
6. Restore evidence-aware best-phase detection.
7. Add regression tests for partial failures and fallback behavior touched by the change.

### Out of scope

- RAG corpus changes.
- Prompt file extraction.
- Agent refactoring.
- MCP.
- broad persistence or frontend rewrites.

### Required acceptance criteria

#### Player with White

Given a game where:

- the user plays White;
- the user has no blunders;
- Black has at least one blunder;

then:

- the user's profile reports zero blunders;
- the opponent's blunder is absent from personal critical moments;
- full game output still contains every ply.

#### Player with Black

The same assertions pass when the user plays Black.

#### Aggregation

- Average CPL and counters equal the player-only subset.
- Primary and secondary weaknesses use the player-only subset.
- Theory queries are derived from the corrected profile.
- No player-specific claim is made when player identity cannot be derived.

#### Best phase

Given sufficient evidence in multiple phases:

- the phase with the lowest valid loss/error score is detected as relatively strongest;
- phases without moves are excluded;
- an all-empty input produces no invented strength.

#### Regression and verification

- Existing API behavior required by the viewer remains available.
- Existing tests pass.
- New white/black regression tests pass.
- New best-phase tests pass.
- Any additive API field is documented in the contract and reflected in frontend types.
- The implementation diff remains limited to the affected flow.

Phase 1 must not be marked complete without evidence for every item above.

### Completion evidence

- Stockfish move output includes explicit `mover_color`.
- White-user and Black-user regressions prove that opponent-only blunders do not
  enter personal statistics or critical moments.
- Mixed-error coverage proves that only the user's critical moment is promoted to
  the coaching profile while the viewer retains both full-game moments.
- Aggregation tests verify exact player-only move counts, average CPL, counters,
  patterns, and theory-query inputs.
- Persistence wiring is verified to receive the player projection and save only
  personal critical moments.
- Unknown player identity is rejected before engine work and produces no
  player-specific claim.
- Normalized phase statistics retain `moves`; best-phase tests cover a strong
  opening, empty phases, all-empty input, and legacy inputs without evidence.
- The additive `mover_color` response field is reflected in frontend types and the
  viewer consumes it directly.
- Backend suite: `33 passed`.
- Frontend ESLint: passed.
- Next.js production build and TypeScript validation: passed.
- Python bytecode compilation for `app` and `tests`: passed.
- Rebuilt Docker API and frontend images are healthy; a real depth-1 Stockfish
  smoke returned three plies with ownership `white, black, white`.

## 6. Phase 2 — Automated quality foundation

### Objective

Create automated constraints that make later RAG, prompt, agent, and MCP changes safe.

### Scope

1. backend lint and type checking;
2. line and branch coverage;
3. unit tests for critical pure logic;
4. property-based tests where invariants are valuable;
5. Stockfish integration tests;
6. PostgreSQL integration and migration tests;
7. ChromaDB integration tests;
8. API contract protection;
9. frontend component tests;
10. Playwright E2E;
11. GitHub Actions quality gates;
12. initial mutation testing on pure critical logic.

### Acceptance criteria

- A pull-request workflow runs deterministic quality gates.
- Coverage reports line and branch results.
- Thresholds are incremental and documented rather than set arbitrarily.
- Stockfish, PostgreSQL, and ChromaDB each have at least one real automated integration path.
- Alembic upgrades an empty PostgreSQL database in CI.
- The frontend has behavioral tests for forms, states, and board navigation.
- A PGN E2E flow passes in the production-like local stack.
- Backend/frontend contract drift fails automatically.
- Mutation testing demonstrates that critical threshold/filter tests kill relevant mutations.

Detailed requirements are in [testing-strategy.md](./testing-strategy.md).

## 7. Phase 3 — RAG professionalization

### Objective

Turn the current opening-focused semantic search into a reproducible, evaluated retrieval system that can abstain and support grounded generation.

### Scope

1. golden evaluation dataset;
2. versioned source manifest;
3. index reconciliation and cleanup;
4. balanced corpus across chess phases;
5. PGN-aware chunking;
6. metadata filters;
7. `insufficient_evidence`;
8. calibrated top-k and threshold;
9. hybrid search;
10. reranking only if measured;
11. grounding with retrieved passages;
12. structured citations.

### Acceptance criteria

- The source manifest reproduces an index without orphan chunks.
- Chunks include required provenance and pipeline versions.
- The corpus covers approved opening, middlegame, tactical, and endgame categories.
- A versioned golden dataset includes answerable and unanswerable cases.
- Retrieval metrics are reported globally and per category.
- Cerno returns `insufficient_evidence` for calibrated unsupported queries.
- Retrieved content reaching the LLM is bounded, identified, and treated as untrusted data.
- Generated citations refer only to supplied source IDs.
- A regression report compares the new pipeline with the previous baseline.

Advanced methods remain conditional. See [rag-improvement-plan.md](./rag-improvement-plan.md).

## 8. Phase 4 — Prompt engineering

### Objective

Make prompt behavior explicit, versioned, schema-validated, evaluable, and resistant to untrusted context.

### Scope

1. separate stable system instructions, tasks, and dynamic context;
2. extract prompts from service code;
3. define Pydantic output contracts;
4. use structured outputs or equivalent schema validation when supported;
5. version prompts and record model/retrieval versions;
6. build prompt evaluation fixtures;
7. add prompt-injection tests;
8. make fallback use observable.

### Acceptance criteria

- Prompts are stored in an owned, documented structure.
- Each production prompt has a name and version.
- Output validation rejects malformed or unsupported content.
- Citations and source IDs are validated against supplied context.
- Adversarial retrieved text cannot override system/task instructions in tests.
- Fallback reason and generation mode are observable.
- Prompt evaluation reports schema validity, groundedness, relevance, latency, and cost where available.

See [prompt-engineering-plan.md](./prompt-engineering-plan.md).

## 9. Phase 5 — Agent hardening

### Objective

Retain the structured coach as the primary product flow while making the experimental agent bounded and reusable.

### Scope

- typed shared tools;
- Pydantic argument validation;
- maximum tool iterations;
- timeout and cancellation;
- input-size limits;
- structured tool errors;
- language consistency;
- tool, duration, and cost traces;
- session persistence only if a real product requirement is approved.

### Acceptance criteria

- The agent cannot loop indefinitely.
- Every tool call uses a shared application service.
- Invalid arguments and unknown tools return controlled errors.
- Timeouts and cancellation have tests.
- Tool execution is observable without logging secrets.
- The role of `/agent/chat` relative to the structured coach is documented.

## 10. Phase 6 — MCP implementation

### Objective

Expose stable Cerno capabilities to external MCP hosts without duplicating application logic.

### Scope

1. shared services are MCP-ready;
2. local `stdio` server;
3. initial read/computation tools;
4. official client smoke tests;
5. schema and error tests;
6. MCP Inspector verification;
7. optional resources after tools are stable;
8. Streamable HTTP implementation for controlled environments.

### Acceptance criteria

- A real MCP client completes initialization.
- `tools/list` returns the approved tool set and no administrative indexing tool.
- `tools/call` executes shared Cerno services.
- Analysis is non-persistent by default.
- Invalid input, timeout, cancellation, and adapter errors are tested.
- A local `stdio` configuration and usage guide exist.
- Inspector evidence is recorded.
- Streamable HTTP is not declared production-ready until Phase 7 security gates pass.

See [mcp-integration-plan.md](./mcp-integration-plan.md).

## 11. Phase 7 — Security, observability, and operations

### Objective

Make expensive, stateful, and remote capabilities safe and diagnosable.

### Scope

- application authentication and authorization;
- admin-only indexing;
- private-data policy;
- quotas and rate limiting;
- PGN/message size limits;
- Stockfish concurrency limits;
- timeouts, cancellation, and job handling;
- liveness and readiness;
- structured logs, metrics, and traces;
- performance budgets;
- remote MCP authorization, HTTPS, and Origin controls;
- dependency and operational audits;
- final public README update.

### Acceptance criteria

- Sensitive and administrative operations require approved authorization.
- CORS is not used as an authentication control.
- Expensive routes have documented quotas and concurrency limits.
- `/health/live` and `/health/ready` have defined semantics and tests.
- Operational dashboards or equivalent queries expose latency, error, fallback, and dependency health.
- Secrets and sensitive data are redacted.
- Remote MCP satisfies its authorization and transport security requirements.
- Runbooks exist for degraded dependencies, index rebuild, and failed analysis.

## 12. Cross-phase review protocol

Before a phase starts:

1. inspect the current code again;
2. confirm no earlier phase invalidated assumptions;
3. resolve open decisions;
4. define exact files and tests;
5. record baseline validation.

Before a phase closes:

1. map every acceptance criterion to evidence;
2. run the full required validation set;
3. update architecture and decision records;
4. report known residual risk;
5. obtain explicit approval before beginning the next phase.

## 13. Global definition of done

Cerno is professionally complete under this plan when:

- player profiles use only the player's moves;
- best-phase detection is evidence-aware;
- critical logic has meaningful branch coverage;
- relevant mutations are detected;
- Stockfish, PostgreSQL, and ChromaDB have real automated tests;
- frontend component and E2E tests protect core flows;
- the API contract is protected;
- CI prevents known regressions;
- RAG has a reproducible index and golden evaluation;
- unsupported retrieval can abstain;
- generated claims are grounded and cited;
- prompts are versioned and evaluated;
- the agent is bounded and observable;
- a real MCP server is discoverable and callable by external clients;
- expensive and stateful operations are protected;
- liveness, readiness, logs, metrics, and operational guidance exist;
- important decisions remain documented and explainable.
