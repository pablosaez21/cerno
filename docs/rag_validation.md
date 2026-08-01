# RAG validation

Last validated: 2026-08-01

## Scope and language

This validation covers the restored and expanded Lichess educational corpus
using the existing `rag-v1` dense retriever, manifest, chunker, filters,
reconciliation, and typed abstention contract. It does not change prompts,
generation, the agent, MCP, BM25, hybrid search, or reranking.

Cerno supports English retrieval queries only. The indexed corpus,
human-readable metadata, golden datasets, evaluation reports, and RAG
operational messages are English. Multilingual retrieval and translation are
outside the current scope.

Tests use temporary ChromaDB collections. The active `data/chromadb` volume is
updated only through the manifest indexer and reconciliation path.

## Corpus coverage

The manifest contains 22 Lichess sources, of which 21 are enabled:

| Phase / category | Enabled sources | Chunks |
| --- | ---: | ---: |
| Opening | 14 | 387 |
| Middlegame / strategy | 2 | 36 |
| Middlegame / pawn structures | 1 | 19 |
| Middlegame / king safety | 1 | 2 |
| Endgame / pawn endings | 1 | 32 |
| Endgame / rook endings | 1 | 32 |
| Endgame / basic minor-piece endings | 1 | 15 |
| **Total** | **21** | **523** |

All 15 historical versioned Lichess IDs remain in the manifest. Study
`6XvaoT1n` is disabled because its PGN export returns HTTP 403. Seven reviewed
educational studies add 136 chunks. Details, authorship, public URLs, chapter
selection, replacement mapping, and licensing limitations are recorded in
[rag-corpus-source-review.md](./rag-corpus-source-review.md).

Reconciliation reports no missing or unexpected source, orphan, incomplete,
duplicate-hash, or pipeline/embedding-version mismatch. Repeating the complete
index command preserves the same content-addressed IDs and deletes no chunks.

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
  --output evals/results/rag_lichess_calibration.json
```

Evaluate only with the held-out split:

```powershell
python scripts/evaluate_rag.py --mode final `
  --output evals/results/rag_lichess_final.json
```

`python scripts/quality.py rag-eval` uses the held-out split and the versioned
retrieval policy. All commands accept an explicit `--collection-path` for
isolated rebuilds.

## Evaluation design

The calibration split contains 18 reviewed cases; the held-out evaluation
split contains 17 different cases. Together they cover opening principles and
repertoires, middlegame plans, pawn structures, king safety, pawn/rook/minor-
piece endings, irrelevant non-chess questions, and chess questions outside the
corpus.

The Wikibooks-specific questions were replaced with natural English questions
whose concepts are actually taught in the selected studies. In particular,
the benchmark no longer claims coverage for doubled/backward pawns, open-file
king attacks, protected/outside passers, or two-bishop mating technique.

Balanced accuracy remains the primary calibration objective. The independent
calibration split selected the existing squared-L2 limit
`0.893064558506012`; neither the threshold nor embedding model changed.

## Metrics

The before result is the previous 20-source/430-chunk corpus. The after result
uses the 21-source/523-chunk Lichess-only corpus and the updated held-out cases.
Both evaluation sets contain 13 answerable and four unanswerable cases and keep
the same phase/category balance, although exact topics changed with real corpus
coverage.

| Metric | Before: Wikibooks expansion | After: Lichess educational corpus |
| --- | ---: | ---: |
| Recall@1 | 0.9231 | 1.0000 |
| Recall@3 | 1.0000 | 1.0000 |
| MRR | 0.9615 | 1.0000 |
| Abstention precision | 1.0000 | 1.0000 |
| Abstentions | 4/17 | 4/17 |
| False positives | 0 | 0 |
| False negatives | 0 | 0 |

The calibration split also reaches classification accuracy, balanced accuracy,
answer recall, and abstention precision of `1.0000` at the unchanged cutoff.
Reports retain rejected-candidate diagnostics for every abstention.

Versioned evidence:

- `evals/results/rag_english_final.json` (before);
- `evals/results/rag_lichess_calibration.json` (after calibration);
- `evals/results/rag_lichess_final.json` (after held-out evaluation).

## Manual retrieval validation

Manual queries against the rebuilt collection verify that:

- inactive-piece planning and activity-over-material retrieve the two
  middlegame strategy studies;
- Isolani, hanging pawns, Maróczy Bind, and d5-chain questions retrieve the
  pawn-structure study;
- central-king and compromised-kingside questions retrieve king safety;
- rule-of-the-square, opposition, key-square, and rook-pawn questions retrieve
  pawn endings;
- Lucena, Philidor, Vancura, and connected-pawn questions retrieve rook endings;
- knight-versus-rook-pawn and wrong-colour-bishop questions retrieve minor-piece
  endings;
- travel, CSS, composed-problem originality, and unsupported tablebase
  implementation questions return `insufficient_evidence`.

The REST/coach compatibility adapter retains its existing list shape; typed
abstention remains an empty list for existing consumers.

## Limitations

- The corpus is curated rather than comprehensive; absence of evidence must
  continue to produce `insufficient_evidence`.
- King-safety coverage is much smaller than other new categories.
- The new minor-piece course does not cover two-bishop or bishop-and-knight
  mate, and the new pawn-structure course has no general doubled/backward-pawn
  lesson.
- Lichess annotation licenses are unspecified even though studies and PGN
  exports are public; author and URL metadata must remain attached.
- Production volume state is deployment-specific and must be rebuilt from the
  manifest explicitly.
- Retrieval remains English-only and dense-only.
