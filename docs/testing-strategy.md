# Cerno testing strategy

**Status:** Phase 2A/2B complete; Phase 2C implemented and locally verified
**Implementation phase:** Phase 2C awaits its first hosted frontend/E2E run
**Last reviewed:** 2026-07-29

## 1. Quality objective

Testing exists to constrain behavior and make failures explainable. Test count and raw coverage are supporting signals, not the definition of quality.

The strategy follows four rules:

1. Define the intended contract before freezing behavior.
2. Test critical logic directly rather than mocking it.
3. Use mocks for isolation and real components for integration confidence.
4. Require evidence at the layer where a failure can occur.

## 2. Current state

The committed pre-Phase-1 baseline contained 21 collected backend cases. Phase
2A established 33 deterministic backend cases. Phase 2B added real integrations;
after the Phase 2C Lichess configuration and PGN coaching regressions there are
41 fast cases and 18 real integration cases, for 59 backend cases. The backend,
frontend, and backend-integration jobs are green in GitHub Actions.

Phase 2A adds the automated quality foundation without claiming the remaining
Phase 2 integration and browser coverage:

- Ruff 0.16.0 is the single Python linter, import sorter, and formatter.
- mypy 2.3.0 checks every module under `app/` and `scripts/`; no module is
  excluded and `check_untyped_defs` extends checking into legacy unannotated
  functions.
- pytest-cov 7.1.0 and coverage.py 7.15.2 measure line and branch coverage.
- The pre-change measurement was 73.32% for lines, 52.86% for branches, and
  69.85% combined. This was recorded before choosing a gate.
- The measured combined baseline is 70.06%, with 73.44% line coverage and
  53.37% branch coverage after the static-correctness edits.
- The initial non-regression gate is 70%, two decimal places below the measured
  baseline only by normal rounding. It is not a target or a claim of broad
  coverage.
- `scripts/quality.py` provides the same cross-platform entry points locally and
  in CI.
- `.github/workflows/quality.yml` defines separate backend and frontend jobs for
  pushes and pull requests.
- Production dependencies remain in `requirements.txt`; development, build,
  test, type-stub, lint, and coverage tools are pinned in
  `requirements-dev.txt`.

Current strengths:

- fast feedback;
- API-level assertions with FastAPI `TestClient`;
- isolated external boundaries;
- basic config, CORS, health, coach, Lichess, theory, user, and weakness tests;
- Phase 1 player-projection and best-phase regressions;
- a unit-level Stockfish output-contract test for mover ownership;
- no requirement for paid API calls.

Phase 2C adds 64 Vitest unit/component cases, strict MSW request isolation,
basic automated accessibility checks, measured frontend coverage, and four
Chromium scenarios against the production Next build, FastAPI, and real
Stockfish. The Lichess browser flow replaces only the outbound HTTP provider.

Identified limitations:

- the expanded `frontend` and new `frontend-e2e` jobs need their first hosted
  run;
- `npm audit` on 2026-07-29 reports five high-severity findings: the pinned
  Next 16.2.9 dependency chain (`next`, its `postcss`, and `sharp`) plus
  `brace-expansion` and `js-yaml` in development tooling. The framework update
  suggested by npm is intentionally not folded into Phase 2C and requires a
  separate dependency-remediation change with full regression evidence;
- frontend response types remain manual rather than OpenAPI-generated;
- E2E protects the live PGN and coach payloads behaviorally, but a complete
  OpenAPI snapshot/generated-client drift gate remains incremental work;
- OpenAI orchestration is largely replaced rather than exercised;
- no mutation testing;
- jsdom accessibility checks do not measure rendered color contrast.

### 2.1 Phase 2A tool decisions

Ruff replaces separate lint, import-sort, and format tools to keep one ruleset
and one cache. The only global rule exemption is `B008`, required by FastAPI's
declarative `Depends` and `Body` defaults. `E402` is scoped only to the
application bootstrap and three command-line scripts that must initialize the
environment or import path before application imports.

mypy was selected instead of Pyright because this repository's quality workflow
is Python-native and the current SQLAlchemy 2 `Mapped` declarations type-check
without the deprecated SQLAlchemy mypy plugin. The configuration is strict where
the current code can support it, but gradual: it checks untyped function bodies
without pretending that every public function is already fully annotated.
Third-party mismatches are isolated with explicit types or narrow casts at SDK
boundaries rather than hidden through global ignores.

Phase 2A deliberately adds no tests merely to inflate the baseline. Its purpose
is to make the existing behavior measurable and prevent regression before Phase
2B adds real adapter and persistence integration coverage.

### 2.2 Phase 2B integration boundary

Phase 2B uses real infrastructure without external credentials or developer
state:

- PostgreSQL 16 runs in a dedicated `cerno_test` service. A defensive fixture
  accepts only the exact local database name and refuses the application's
  configured database. Every case recreates `public`, migrates from empty to
  Alembic `head`, and cleans the schema afterward.
- ChromaDB uses a real persistent collection under pytest `tmp_path`, a
  deterministic keyword embedding, and a controlled local corpus. Importing the
  application no longer opens `data/chromadb`; the product collection is lazy.
- Stockfish runs as a real process at depth 1. The test fixture resolves
  `TEST_STOCKFISH_PATH`, `STOCKFISH_PATH`, the ignored Windows binary, and common
  Linux package paths.
- No integration test contacts Lichess, OpenAI, or another paid/live service.
- `docker-compose.integration.yml` uses tmpfs and a distinct Compose project, so
  it has no persistent volume and does not alter the ordinary Cerno stack.

## 3. Test layers

```mermaid
flowchart TB
    Unit["Unit and property tests"]
    Integration["Adapter and persistence integration"]
    Contract["API and schema contracts"]
    Component["Frontend component tests"]
    E2E["Browser end-to-end"]
    Eval["RAG and prompt evaluation"]

    Unit --> Integration
    Integration --> Contract
    Contract --> Component
    Component --> E2E
    Eval -. "AI quality evidence" .-> Contract
```

The evaluation layer is not a replacement for deterministic tests. It measures semantic quality that ordinary assertions cannot cover.

## 4. Unit testing

### 4.1 Stockfish-domain helpers

Directly test:

- `calculate_cpl`;
- `classify_move`;
- exact boundaries at 50/51, 100/101, and 300/301 CPL;
- `get_phase`;
- `get_summary`;
- `detect_phase_weaknesses`;
- score handling around mate values;
- invalid and empty PGN handling.

Tests should assert stable properties rather than exact engine scores where engine versions may vary.

### 4.2 Player projection and weakness aggregation

Phase 1 introduced regression coverage for:

- White user, only Black blunders;
- Black user, only White blunders;
- both players blunder, only the user's error is counted;
- full viewer analysis retains every ply;
- personal critical moments contain only the user's plies;
- persistence receives the player projection rather than the full-game analysis;
- player-only counters and average CPL match the filtered subset;
- empty phases do not become strengths;
- player identity absent from a game produces no personal analysis;
- analysis moves without valid ownership fail closed.

The pure `project_analysis_for_player` helper makes player projection independently
testable. A Docker smoke additionally verifies real Stockfish output for ply count
and ownership. Phase 2 may add property-based coverage without changing this
contract.

### 4.3 Coach

Test:

- happy path with shared services isolated;
- no games;
- game without PGN;
- one game fails and another succeeds;
- all games fail;
- White, Black, win, loss, draw, and anonymous opponent;
- fallback without OpenAI;
- malformed provider output;
- source-reference sanitization;
- `save=false` performs no persistence;
- `save=true` requires a database session;
- commit and rollback orchestration;
- corrected player profile drives RAG queries.

### 4.4 Lichess

Retain current response tests and add:

- empty 200 response;
- malformed NDJSON;
- incomplete player metadata;
- URL-safe usernames;
- local cooldown prevents an additional outbound call;
- concurrent requests remain serialized;
- `Retry-After` remains coherent across router and service.

Live Lichess tests must be opt-in or scheduled because they are rate-limited and externally variable.

### 4.5 RAG technical logic

Unit-test:

- PGN-aware chapter parsing;
- metadata normalization;
- stable chunk IDs;
- content hashes;
- manifest validation;
- source reconciliation;
- deletion plan for stale chunks;
- retrieval-result schema;
- `insufficient_evidence`;
- query/filter construction.

Semantic quality belongs to the evaluation suite, not only unit tests.

### 4.6 Prompts and structured output

Test:

- prompt registry loads known versions;
- required variables are present;
- dynamic context is serialized separately from instructions;
- Pydantic validation accepts valid output;
- missing, extra, or invalid fields are rejected as designed;
- source IDs must exist in supplied context;
- fallback activates on provider, timeout, and validation failures;
- fallback reason is recorded;
- language selection is respected.

### 4.7 Agent

Test:

- approved tool sequence;
- invalid JSON arguments;
- Pydantic argument rejection;
- unknown tool;
- adapter error;
- maximum iteration boundary;
- timeout;
- cancellation;
- empty model response;
- tool trace without secrets.

## 5. Property-based testing

Use Hypothesis only where general invariants are clearer than enumerated fixtures.

Candidate properties:

- CPL is never negative.
- Error counters are never negative.
- Per-phase move counts sum to the number of projected player moves.
- Total errors cannot exceed player moves.
- Player projection never returns an opponent move.
- Full-game projection preserves input order and count.
- Chunk IDs are stable for the same source/version.
- Manifest reconciliation is idempotent.
- Serialization round trips preserve required fields.
- Valid PGN variations supported by the parser do not crash pure preprocessing.

Property tests must use bounded strategies and produce readable failure examples.

## 6. Stockfish integration

**Phase 2B status:** Implemented and passing locally: 8 cases.

### 6.1 Fixture set

Maintain small controlled PGN fixtures for:

- ordinary opening;
- tactical error;
- mate;
- promotion;
- castling;
- en passant;
- custom initial FEN;
- malformed PGN.

### 6.2 Stable assertions

At low depth, assert:

- expected ply count;
- valid FEN before and after;
- valid mover color;
- non-negative CPL;
- classification belongs to the allowed set;
- move order and SAN/UCI shape;
- structured error when the executable is unavailable.

Avoid relying on exact centipawn scores unless the engine binary and options are pinned and the assertion is intentionally version-specific.

The implemented fixture set covers an ordinary game, White and Black player
projections, castling, en passant, promotion, mate, a custom initial FEN, invalid
PGN, and a missing executable. Every real engine assertion uses depth 1 and
checks stable properties: ply count, mover ownership, valid FEN, non-negative
CPL, allowed phase/classification, finite scores, and expected special-move UCI.

Local Windows resolution prefers:

```text
TEST_STOCKFISH_PATH
STOCKFISH_PATH
engines/stockfish.exe
stockfish on PATH
```

GitHub Actions installs the Ubuntu package and sets
`TEST_STOCKFISH_PATH=/usr/games/stockfish`.

### 6.3 Performance signal

Record analysis duration, depth, and plies for a small benchmark. Start with observation; only introduce a hard budget after a stable baseline exists.

## 7. PostgreSQL integration

Use PostgreSQL, not SQLite as the only substitute, because the schema uses PostgreSQL-specific JSONB and production constraints.

**Phase 2B status:** Implemented and passing locally: 6 cases.

Test workflow:

```text
empty PostgreSQL
  -> alembic upgrade head
  -> create user
  -> save game analysis
  -> replace critical moments
  -> upsert weakness profile
  -> save recommendation
  -> commit
  -> read and verify
```

Required cases:

- migration from empty database;
- unique game-analysis constraint;
- foreign keys;
- JSONB persistence;
- repeat save/upsert;
- stale critical moves removed;
- full coach transaction committed;
- injected failure rolls back every write;
- query ordering and limits.

Integration fixtures must isolate and clean their own data.

Local startup:

```powershell
.\venv\Scripts\python.exe scripts\quality.py integration-up
.\venv\Scripts\python.exe scripts\quality.py postgres
.\venv\Scripts\python.exe scripts\quality.py integration-down
```

The default test URL is
`postgresql+psycopg://cerno_test:cerno_test@localhost:55432/cerno_test`.
`TEST_DATABASE_URL` may override it only when the target is local, is named
exactly `cerno_test`, and differs from Cerno's configured application database.

The integration run found a real schema drift: ORM timestamp columns were
non-nullable while migration `0001` created them nullable. Migration
`0002_timestamp_columns_not_null` fills any historical nulls and applies the
model constraint. Autogeneration comparison is now empty after upgrading a blank
database to `head`.

## 8. ChromaDB integration

Use a temporary directory and a small deterministic embedding function where semantic model behavior is not under test.

**Phase 3 status:** Implemented with 8 real temporary-Chroma cases.

Technical integration cases:

- create collection;
- index known chunks;
- retrieve expected shape;
- preserve metadata;
- empty collection;
- reindex same source;
- source loses a chapter;
- stale chunks removed;
- manifest reconciliation;
- incomplete metadata rejected;
- read/write failure converted to a structured application error.

A separate evaluation run should use the production embedding configuration.

The current cases verify an empty collection, real upsert, metadata and
distance persistence, unambiguous retrieval, idempotent source replacement,
stale deletion, manifest reconciliation and orphan cleanup, phase filters,
typed abstention, reopening the on-disk collection, and controlled
initialization failure. The semantic golden set runs separately with the
production embedding through `python scripts/quality.py rag-eval`.

## 9. API contract testing

The backend OpenAPI document and frontend manual types can drift.

Approved options to evaluate in Phase 2:

1. generate TypeScript types/client from OpenAPI; or
2. keep manual client code with a controlled OpenAPI snapshot and contract tests.

Whichever option is chosen must detect:

- removed or renamed fields;
- incompatible enum/type changes;
- request validation changes;
- status-code/error-contract changes.

Contract fixtures should include the additive player-move field introduced by Phase 1 if it is part of the public response.

## 10. Frontend testing

### 10.1 Implemented tooling

- Vitest and `@vitest/coverage-v8` 4.1.10;
- React Testing Library 16.3.2 and DOM Testing Library 10.4.1;
- user-event 14.6.1 and jest-dom 7.0.0;
- MSW 2.15.0;
- `vitest-axe` 0.1.0;
- jsdom 30.0.1;
- Playwright 1.62.0 with Chromium only.

These versions are pinned in `frontend/package-lock.json`. They support Node 24,
React 19.2, TypeScript 5.9, and the existing `react-chessboard` 5.10 /
`chess.js` 1.4 pairing. Vitest follows the bundled Next 16 guidance and uses
Vite's native TypeScript path resolution.

### 10.2 Structure and commands

```text
frontend/
  src/lib/__tests__/              pure helpers, contracts, API
  src/components/__tests__/       forms, states, viewer, results, profile
  src/test/                       setup, MSW, fixtures, axe helper
  e2e/fixtures/                   versioned PGN
  e2e/support/                    servers, process cleanup, browser errors
  e2e/*.spec.ts                   PGN, Lichess, and error flows
  vitest.config.mts
  playwright.config.ts
```

Run independently:

```powershell
cd frontend
npm run test:unit
npm run test:components
npm test
npm run test:coverage
npm run test:e2e
npm run test:all
```

`npm run test:e2e` builds with the isolated API URL and then runs Playwright.
`test:e2e:only` is used after an explicit E2E build in CI. The wrapper owns a
temporary directory and removes it after Playwright exits, including on failure.

### 10.3 Component coverage

#### API client

- base URL normalization;
- network error;
- FastAPI string detail;
- FastAPI validation-array detail;
- unknown non-JSON error;
- success deserialization.

#### Forms and workspace

- Lichess submit;
- PGN submit;
- loading state;
- error state;
- empty state;
- success state;
- switching modes does not mutate unrelated results;
- accessible labels and keyboard submission.

#### Game viewer

- prefers valid engine FEN;
- reconstructs positions from PGN as fallback;
- custom initial FEN;
- invalid FEN fallback;
- previous/next/start/end controls;
- ArrowLeft, ArrowRight, Home, and End;
- move-list synchronization;
- critical-moment jump;
- player orientation;
- manual flip;
- complete ply list;
- responsive size rule at representative viewport sizes.

Tests should target behavior and accessibility roles, not Tailwind class snapshots.

The implemented suite covers every item above. `GameViewer` logic is extracted
only into pure helpers; React interaction stays in the component. Unit tests
mock only `react-chessboard` rendering because jsdom has no layout engine.
Browser tests render the real board.

### 10.4 MSW and accessibility

MSW listens in `src/test/setup.ts` with `onUnhandledRequest: "error"`. Default
handlers model the four frontend endpoints, and individual cases override only
the response they need. Fixtures include White and Black ownership, complete
global moments, personal moments, empty arrays, delayed responses, and HTTP
400/404/429/500 variants.

`vitest-axe` checks both forms, result states, errors, the player profile,
coaching output, and board controls. The suite also asserts labels, named icon
buttons, live loading/navigation status, tab relationships, and keyboard
navigation. The color-contrast axe rule is disabled only in jsdom because it
lacks rendered layout; this is not a claim of complete accessibility.

## 11. End-to-end testing

### 11.1 Required PGN scenario

1. Open Cerno.
2. Select PGN analysis.
3. Paste a controlled PGN.
4. Submit.
5. Observe a successful engine report.
6. Require a non-empty full-game coaching explanation.
7. Require at least one visible recommendation.
8. Navigate moves.
9. Jump to a critical moment.
10. Verify the board changes.

This scenario is implemented with the production Next build, FastAPI, and the
real configured Stockfish executable at depth 1. The six-ply fixture contains a
stable queen blunder, allowing navigation and critical-jump assertions without
depending on exact centipawn values. The board is additionally measured at
1280x720 and 390x844. The coaching assertion prevents the scenario from passing
when the response contains only engine metrics and the board.

### 11.2 Required Lichess scenario

Use a controlled mock for Lichess at the backend adapter boundary:

1. submit username;
2. return known games;
3. analyze;
4. verify player-specific metrics;
5. review all plies on the board;
6. verify error and rate-limit UI variants.

The implemented fixture server returns NDJSON for `CernoE2E` and 404 for
`MissingE2E`. `LICHESS_API_BASE_URL` is the narrow injection seam and still
defaults to `https://lichess.org` for the product. The test keeps the browser,
frontend client, FastAPI route, coach, projection, local generation fallback,
and Stockfish real. It unchecks saving, so PostgreSQL is never contacted.

Live Lichess remains a separate scheduled smoke test.

### 11.3 Isolation and artifacts

Playwright uses ports 3100, 8100, and 4300, one worker, and Chromium only.
OpenAI is disabled, Chroma uses a new empty temporary directory, and no
production/development database or index is accessed. `webServer` owns all three
processes; the outer runner removes temporary data after those processes stop.

On failure Playwright retains:

- HTML report;
- trace;
- screenshot;
- video.

## 12. Golden regression fixtures

Version fixtures for:

- user with White;
- user with Black;
- opponent-only blunder;
- tactical mistake;
- weak opening;
- weak middlegame;
- weak endgame;
- mate;
- promotion;
- castling;
- en passant;
- initial FEN;
- malformed PGN;
- partial multi-game failure.

Golden assertions may cover stable structured data:

- ply count and mover color;
- phases;
- classification category;
- player-only critical moments;
- profile counters;
- selected retrieval documents;
- prompt structure and source IDs.

Do not compare generative prose word for word unless a deterministic local fallback is specifically under test.

## 13. Coverage policy

Line and branch coverage were introduced together in Phase 2A. The authoritative
configuration is in `pyproject.toml`, uses `app/` as its source, and has no
coverage omissions.

The Phase 2A baseline and Phase 2B complete-suite result are:

| Measure | Phase 2A | Phase 2B |
| --- | ---: | ---: |
| Lines | 755/1,028 — 73.44% | 872/1,050 — 83.05% |
| Branches | 111/208 — 53.37% | 137/208 — 65.87% |
| Combined coverage.py result | 70.06% | 80.21% |
| Required gate | 70.00% | 70.00% |

The quick suite remains independently healthy at 71.78% combined. The first
hosted PostgreSQL/Stockfish baseline is green, but the gate is not raised from a
single hosted sample or as an unrelated consequence of frontend work.
Reconsider it after multiple stable runs and meaningful new backend coverage.

Critical-module changes from Phase 2A to Phase 2B:

| Module | Phase 2A | Phase 2B |
| --- | ---: | ---: |
| `app/db/repositories/sessions.py` | 0.00% | 0.00% |
| `app/db/repositories/analyses.py` | 14.47% | 76.32% |
| `app/db/repositories/recommendations.py` | 45.45% | 100.00% |
| `app/db/repositories/users.py` | 31.25% | 100.00% |
| `app/db/repositories/weaknesses.py` | 25.00% | 100.00% |
| `app/services/rag.py` | 18.07% | 50.48% |
| `app/services/stockfish.py` | 71.54% | 84.62% |
| `app/services/coach.py` | 77.33% | 78.54% |

Agent sessions remain at 0% because agent work is outside Phase 2B. RAG download,
chunk parsing, and production embeddings remain uncovered intentionally because
their functional redesign belongs to Phase 3. Coverage exclusions remain zero.

### 13.1 Frontend Phase 2C baseline

Vitest measures every TypeScript module under `src/components` and `src/lib`.
Tests and test fixtures are excluded; `GameViewer`, the API client, and critical
components are not excluded.

| Measure | Covered | Baseline | Non-regression floor |
| --- | ---: | ---: | ---: |
| Statements | 291/304 | 95.72% | 92% |
| Branches | 228/274 | 83.21% | 80% |
| Functions | 109/114 | 95.61% | 90% |
| Lines | 275/280 | 98.21% | 95% |

Critical modules:

| Module | Lines | Branches | Functions |
| --- | ---: | ---: | ---: |
| `src/lib/api.ts` | 100% | 100% | 100% |
| `src/lib/game-viewer.ts` | 100% | 96.55% | 100% |
| `src/components/game-viewer.tsx` | 100% | 87.71% | 100% |
| `src/components/analysis-workspace.tsx` | 100% | 87.50% | 100% |
| `src/components/analysis-forms.tsx` | 100% | 90.00% | 100% |
| `src/components/player-profile.tsx` | 94.44% | 67.56% | 92.30% |

The weakest meaningful branches are conditional empty/optional presentation in
`coach-results.tsx` (53.12%) and `player-profile.tsx` (67.56%). The only zero
line module is the trivial static `site-header.tsx`; it remains visible in the
report rather than being excluded. Floors were set only after the 64-case
baseline passed.

## 14. Mutation testing

Begin only after Phase 1 regressions and Phase 2 unit coverage are stable.

First mutation targets:

- classification boundaries;
- CPL clamp;
- player-color filter;
- phase scoring;
- best-phase selection;
- critical-moment selection;
- no-answer threshold logic;
- citation validation.

Mutation testing should initially run manually or on a schedule. It may become a PR gate only after runtime and flakiness are understood.

## 15. Mocking policy

Good uses:

- isolate an HTTP provider while testing application behavior;
- make provider failures deterministic;
- avoid paid calls in PRs;
- test a router's status-code mapping.

Unacceptable substitutions:

- mocking `aggregate_game_analyses` in the only test of aggregation;
- mocking Stockfish in every engine test;
- mocking Chroma in every retrieval pipeline test;
- mocking repositories in every persistence test;
- claiming E2E coverage when the browser or backend is absent.

Every critical adapter requires at least one real automated integration path.

## 16. CI

### 16.1 Implemented workflow

`.github/workflows/quality.yml` runs on relevant pushes and pull requests with
read-only repository permissions and cancels superseded runs on the same ref.
Its four independent jobs are:

```text
backend:
  Python 3.13
  install requirements-dev.txt
  Ruff lint
  Ruff format check
  mypy
  pytest with line and branch coverage
  workflow structure validation
  upload coverage.xml

frontend:
  Node 24
  npm ci
  ESLint
  tsc --noEmit
  Vitest with V8 coverage
  Next.js production build
  upload frontend coverage

backend-integration:
  Python 3.13
  PostgreSQL 16 service container with cerno_test
  install Stockfish from Ubuntu packages
  run all backend cases with line and branch coverage
  upload the complete coverage.xml

frontend-e2e:
  Python 3.13 and Node 24
  install backend/frontend dependencies
  install Ubuntu Stockfish and Chromium
  build against the isolated E2E API URL
  run four Playwright scenarios
  upload report, traces, screenshots, and retained failure videos
```

The integration job has no secrets, paid APIs, live Lichess calls, persistent
Chroma volume, or `continue-on-error`. YAML structure, the PostgreSQL service,
Stockfish installation, Chromium command, and required commands are checked
locally by `scripts/validate_workflow.py`. The backend, original frontend, and
backend-integration jobs are green on GitHub. The expanded frontend commands
and new browser job require their first push.

### 16.2 Local commands

Run the fast Phase 2A gate from the repository root:

```powershell
.\venv\Scripts\python.exe scripts\quality.py all
```

The script uses the active Python interpreter and resolves `npm` from `PATH`, so
the equivalent portable command is:

```text
python scripts/quality.py all
```

With Docker Desktop running, execute every Phase 2B gate and clean up the
ephemeral PostgreSQL service automatically:

```powershell
.\venv\Scripts\python.exe scripts\quality.py full
```

Available quality targets:

```text
tests             fast tests only
integration       every real integration
postgres          PostgreSQL only
chroma            ChromaDB only
stockfish         Stockfish only
suite             all backend tests
coverage          fast-suite coverage
coverage-all      complete-suite coverage
integration-up    start isolated local PostgreSQL
integration-down  stop isolated local PostgreSQL
full              start integration DB, run every gate, then clean up
frontend-tests    Vitest without coverage
frontend-coverage Vitest with V8 coverage and floors
frontend-e2e      production build plus Playwright
frontend-full     frontend static, coverage, build, and browser gates
```

The latest complete backend evidence is:

```text
Ruff: All checks passed; 57 Python files formatted
mypy: Success, no issues in 36 source files
fast pytest: 40 passed, 18 deselected
PostgreSQL: 6 passed
ChromaDB: 4 passed
Stockfish: 8 passed
complete pytest: 59 passed
complete coverage: 80.44%, required 70.00% reached
workflow validation: valid
frontend ESLint: passed
frontend TypeScript: passed
frontend Vitest: 64 passed
frontend coverage: 95.72% statements, 83.21% branches,
                   95.61% functions, 98.21% lines
Next.js production build: passed
Playwright Chromium: 4 passed against Next standalone, FastAPI, and Stockfish
Python dependency consistency: no broken requirements
npm dependency audit: 5 high-severity findings; remediation pending separately
```

### 16.3 Remaining Phase 2 target

The live PGN and coach contracts now have behavior-level browser protection.
Remaining incremental quality work is:

```text
generated-client or complete OpenAPI snapshot contract-check
mutation-testing
optional scheduled live-Lichess smoke
```

### Scheduled/manual workflow

```text
rag-evaluation
prompt-evaluation
live-lichess-smoke
optional-live-llm-smoke
mutation-testing
dependency-audit
performance-baseline
```

Paid and externally rate-limited jobs require explicit secrets, budget limits, and opt-in controls.

## 17. Quality gates

A change cannot merge when:

- required deterministic tests fail;
- lint or type checking fails;
- branch coverage drops below the approved threshold;
- OpenAPI contract changes without an approved update;
- migration from empty PostgreSQL fails;
- the relevant integration test fails;
- a critical mutation survives after being designated as a gate;
- the change has undocumented behavior or architecture impact.

RAG and prompt changes additionally require an evaluation comparison and explanation of regressions.

## 18. Phase completion evidence

### 18.1 Phase 2A

Phase 2A is complete locally with:

- pinned development quality dependencies separated from production;
- one repository configuration for Ruff, mypy, pytest-cov, and coverage.py;
- all Python source under `app/` and `scripts/` passing mypy without module
  exclusions;
- a measured line and branch baseline and an enforced 70% gate;
- a cross-platform local quality command;
- separate backend and frontend CI jobs;
- local validation of every command represented in the workflow.

The Phase 2A backend and frontend jobs are green in GitHub Actions.

### 18.2 Phase 2B

Phase 2B is implemented and verified locally with:

- empty PostgreSQL migration through `0002` and no model drift;
- real repository, JSONB, relationship, foreign-key, commit, replacement,
  upsert, and rollback evidence;
- real temporary Chroma persistence, retrieval, metadata, upsert, and error
  evidence;
- real Stockfish execution across stable chess invariants and special moves;
- 59 passing backend cases and 80.44% combined complete-suite coverage after
  the Phase 2C Lichess configuration and PGN coaching regressions;
- an isolated local Compose service and a GitHub PostgreSQL service container;
- a required `backend-integration` job with no external credentials.

GitHub Actions run `30460515439` verifies the backend, frontend, and real
integration jobs for commit `e2050f1`; Phase 2B is complete locally and hosted.

### 18.3 Phase 2C

Phase 2C is implemented and locally verified with:

- 64 passing Vitest cases and enforced measured coverage floors;
- strict MSW isolation and eight automated accessibility checks;
- dedicated GameViewer position, navigation, ownership, orientation, and
  defensive-state coverage;
- PGN API/component/browser regressions requiring a real full-game explanation
  and at least one recommendation while retaining the board;
- four passing Chromium flows against the production frontend, FastAPI, and
  real Stockfish;
- desktop and mobile browser inspection at 1280x720 and 390x844 with no
  horizontal overflow, no browser warning/error entries, and all expected
  controls present;
- a local-only Lichess adapter fixture and automatic process/data cleanup;
- frontend coverage and Playwright artifact upload configuration.

Hosted completion remains pending until the expanded `frontend` and new
`frontend-e2e` jobs are green. The broader Phase 2 is therefore not yet marked
complete.

### 18.4 Full Phase 2

Phase 2 is complete only with:

- CI run links or equivalent logs;
- coverage reports;
- named integration tests for Stockfish, PostgreSQL, and Chroma;
- frontend test report;
- Playwright PGN evidence;
- contract-check evidence;
- documented remaining gaps and any quarantined flaky test with owner and reason.
