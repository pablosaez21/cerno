# RAG validation

Last validated: 2026-07-30

## Scope and language

This validation covers the licensed middlegame/endgame corpus expansion and
the final English-only adjustment of the existing `rag-v1` dense retriever.
Those Phase 3 results predate and remain unchanged by the Phase 4 grounded
coach connection. This document does not validate prompts, generation, the
agent, MCP, BM25, hybrid search, or reranking.

Cerno currently supports English retrieval queries only. The indexed corpus,
human-readable metadata, golden datasets, evaluation reports, and RAG
operational messages are English. Multilingual retrieval and query translation
are outside the current scope.

Technical tests create ChromaDB collections only under pytest `tmp_path`. The
operational rebuild updates `data/chromadb` only through the manifest indexer
and reconciliation path.

## Corpus coverage

The manifest contains 21 sources, of which 20 are enabled:

| Phase / category | Enabled sources | Chunks |
| --- | ---: | ---: |
| Opening | 14 | 387 |
| Middlegame / strategy | 1 | 1 |
| Middlegame / pawn structures | 1 | 14 |
| Middlegame / king safety | 1 | 10 |
| Endgame / pawn endings | 1 | 9 |
| Endgame / rook endings | 1 | 4 |
| Endgame / basic minor-piece endings | 1 | 5 |
| **Total** | **20** | **430** |

The six added sources are pinned Wikibooks revisions licensed CC BY-SA 4.0.
Selection, provenance, rejected candidates, and remaining coverage risks are
documented in
[rag-corpus-source-review.md](./rag-corpus-source-review.md).
`6XvaoT1n` remains disabled because Lichess returns HTTP 403.

The final reconciliation reports no missing or unexpected source, orphan,
incomplete, duplicate-hash, or pipeline/embedding-version mismatch. Repeating
the complete index command produces the same content-addressed IDs and no stale
deletions.

## Reproducible commands

Build or idempotently update the manifest-controlled index:

```powershell
python scripts/index_studies.py
```

Audit without mutation, then explicitly reconcile obsolete content:

```powershell
python scripts/reconcile_rag_index.py
python scripts/reconcile_rag_index.py --apply
```

Calibrate only with the calibration split:

```powershell
python scripts/evaluate_rag.py --mode calibrate `
  --output evals/results/rag_english_calibration.json
```

Evaluate only with the held-out split:

```powershell
python scripts/evaluate_rag.py --mode final `
  --output evals/results/rag_english_final.json
```

To reproduce the pre-calibration English result, temporarily supply the former
`1.2241348028182983` distance in an isolated run. The committed
`evals/results/rag_english_initial_threshold.json` records that result.

`python scripts/quality.py rag-eval` uses the held-out evaluation split and
the versioned retrieval policy. Commands accept an explicit
`--collection-path` for isolated rebuilds.

## Evaluation design

`evals/rag_calibration_queries.jsonl` contains 18 reviewed English cases and is
used only to choose the cutoff. `evals/rag_evaluation_queries.jsonl` contains
17 different held-out English cases and is used only for reporting. Together
they retain coverage of:

- opening principles and repertoires;
- middlegame strategy, pawn structures, and king safety;
- pawn, rook, and basic minor-piece endings;
- irrelevant non-chess queries;
- in-domain questions for which the corpus has no evidence.

Each row declares whether Cerno should answer and which category, chapter,
topic, or source IDs are valid. Chapter labels are used where a broad
same-source/category match would be too permissive.

The former generic question about “factors for choosing a plan” was narrowed
to the documented relationship between positional evaluation and planning.
The source explicitly states that a plan follows evaluation and must respond
to the position, so those cases remain answerable. The former question asking
for a defensive rook-and-pawn method was replaced with the documented winning
factors for rook and one pawn versus rook. The source names the king and rook
positions and the pawn file, but it does not teach a complete weak-side
defensive method.

Balanced accuracy is the primary calibration objective. Ties use
classification accuracy, abstention precision, answer recall, and finally the
lower-distance conservative cutoff. With the English-only calibration split,
the selected squared-L2 limit is `0.893064558506012`. The previous
`1.2241348028182983` limit was retained for the initial English evaluation and
was then lowered; the embedding version was not changed.

## Metrics

The historical mixed-language result is included only as the “before” measure
for this adjustment. It used the same 17-case thematic coverage but included
English and Spanish queries. The two English columns use the revised held-out
17-case set; ranking metrics are calculated over its 13 answerable cases.

| Metric | Mixed-language before | English, old threshold | English, calibrated threshold |
| --- | ---: | ---: | ---: |
| Recall@1 | 0.5385 | 0.9231 | 0.9231 |
| Recall@3 | 0.5385 | 1.0000 | 1.0000 |
| MRR | 0.5385 | 0.9615 | 0.9615 |
| Abstention precision | 0.4000 | 1.0000 | 1.0000 |
| Abstentions | 10/17 | 3/17 | 4/17 |
| False positives | 0 | 1 | 0 |
| False negatives | 6 | 0 | 0 |

The old threshold incorrectly accepted the unsupported composed-problem
originality query at distance `1.1066064834594727`. Separate calibration chose
the lower threshold before the final held-out run, which removes that false
positive without rejecting any supported case. Recall@1 remains `0.9231`
because the exact “Two Pawns and Rook vs. Rook” chapter ranks second behind a
broader rook-ending introduction; it is present within top 3.

When retrieval abstains, each report row now records the best rejected
candidate, distance, expected and retrieved category, expected/inferred and
retrieved phase, filters applied, and a rejection reason.

Versioned evidence:

- `evals/results/rag_english_initial_threshold.json`;
- `evals/results/rag_english_calibration.json`;
- `evals/results/rag_english_final.json`.

## Manual retrieval validation

The production-configured local collection was queried through the evaluator:

- middlegame planning retrieves `middlegame_strategy`;
- doubled and backward pawn questions retrieve `pawn_structures`;
- king safety questions retrieve `king_safety`;
- protected and outside passed-pawn questions retrieve `pawn_endgames`;
- rook-and-pawn technique retrieves `rook_endgames`;
- two-bishop mating technique retrieves `minor_piece_endgames`;
- travel, CSS, composed-problem originality, and unsupported tablebase
  implementation questions return `insufficient_evidence`.

The REST/coach compatibility adapter still exposes the existing list shape; a
typed abstention is represented as an empty list to existing consumers.

## Limitations

- Middlegame and endgame coverage is real but much shallower than the
  387-chunk opening corpus.
- The rook source is a concise practical introduction and does not explain a
  complete defensive method for rook and pawn versus rook or every named
  theoretical position.
- Basic minor-piece coverage focuses on mating material, not the full range of
  bishop and knight endings.
- Recall@1 has one remaining ranking miss inside the correct rook-ending source
  and category; reranking remains outside Phase 3.
- Attribution and CC BY-SA metadata must remain attached wherever retrieved
  source text is redistributed.
- Production volume state remains deployment-specific; each deployment must
  run the manifest rebuild and reconciliation explicitly.
- Retrieval remains English-only and dense-only. Multilingual retrieval,
  translation, grounded generation, and citations remain out of scope.
