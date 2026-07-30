# RAG validation

Last validated: 2026-07-29

## Scope and isolation

Phase 3 implements dense retrieval reliability only. It does not change
prompts, LLM generation, the agent, MCP, or the frontend, and it does not add
hybrid search, reranking, grounding, or citations.

The baseline was measured read-only against the pre-Phase-3 local index. The
final index was rebuilt at a temporary path; neither evaluation nor tests
modified `data/chromadb`.

## Corpus coverage

The manifest records 15 existing Lichess studies; 14 are enabled:

| Phase | Recorded | Enabled/rebuilt | Chunks |
| --- | ---: | ---: | ---: |
| Opening | 15 | 14 | 387 |
| Middlegame | 0 | 0 | 0 |
| Endgame | 0 | 0 | 0 |

`6XvaoT1n` is recorded but disabled because Lichess returns HTTP 403. No
replacement or new source was invented. Middlegame and endgame queries
therefore return `insufficient_evidence`.

The pre-change local inventory contained 360 chunks, including two unexpected
`lVCUmd79` chunks, and no required phase, pipeline, embedding, or content-hash
metadata. The clean temporary rebuild and the migrated local Docker volume have
no orphan, incomplete, duplicate-hash, or version-mismatch chunks.

## Reproducible commands

Build a clean index at an explicit path:

```powershell
python scripts/index_studies.py `
  --collection-path C:\tmp\cerno-rag `
  --collection-name chess_theory
```

Audit without mutation, then explicitly reconcile:

```powershell
python scripts/reconcile_rag_index.py
python scripts/reconcile_rag_index.py --apply
```

Evaluate the current configured collection:

```powershell
python scripts/quality.py rag-eval
```

Evaluate an isolated rebuild:

```powershell
python scripts/evaluate_rag.py --mode final `
  --collection-path C:\tmp\cerno-rag
```

Threshold calibration is reproducible with `--mode calibrate`. It reports the
recommended value but never silently mutates policy.

## Golden dataset

`evals/rag_queries.jsonl` contains 12 reviewed cases:

- five answerable opening queries in English and Spanish;
- two unsupported middlegame queries in English and Spanish;
- three unsupported endgame queries in English and Spanish;
- two irrelevant non-chess queries.

Each row declares answerability and valid phase, category, topic, or source
labels.

## Baseline and final metrics

| Metric | Pre-Phase-3 baseline | `rag-v1` final |
| --- | ---: | ---: |
| Recall@1 | 0.80 | 1.00 |
| Recall@3 | 1.00 | 1.00 |
| MRR | 0.90 | 1.00 |
| Abstention precision | 0.00 | 1.00 |
| Abstentions | 0/12 | 7/12 |

The measured cutoff is squared L2 distance
`1.3739006519317627`. Phase/category filters are applied first. The reports are
versioned in `evals/results/rag_baseline_8d195c4.json`,
`rag_calibration_rag_v1.json`, and `rag_final_rag_v1.json`.

## Limitations

- The corpus is English and opening-only; Spanish succeeds through the
  multilingual behavior of the existing embedding, not Spanish source text.
- The golden set is deliberately small and was used for calibration as well as
  final reporting. It needs expansion and a holdout split before using the
  metric as a broad production-quality claim.
- Production Chroma inventory remains unverified; deployment must run the
  manifest rebuild/reconciliation explicitly.
- Retrieval remains dense-only and generation remains retrieval-assisted, not
  grounded or citation-validated.

## Local Docker smoke validation

The API image includes the versioned `data-manifest` assets. After rebuilding
the local stack, `/health` returned `ok`, an opening-principles query returned
one `opening_principles`/`opening` result, and unsupported rook-endgame and
PostgreSQL queries both returned the compatible empty result list. API,
frontend, and PostgreSQL containers were healthy.
