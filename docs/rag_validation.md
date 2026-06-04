# RAG validation

Last validated: 2026-06-04

## Indexing run

Command:

```powershell
venv\Scripts\python.exe scripts\index_studies.py
```

Result:

- Studies indexed: 14
- Studies failed: 1
- Chunks indexed: 358

Failed studies:

| study_id | category | reason |
| --- | --- | --- |
| `6XvaoT1n` | `opening_principles` | Lichess returned HTTP 403 |

This is acceptable for the current curated seed: the script continues after failures and keeps the ChromaDB collection usable.

## Query validation

Command:

```powershell
venv\Scripts\python.exe scripts\test_rag_queries.py
```

Manual quality notes:

| query | result quality |
| --- | --- |
| `basic opening principles` | Acceptable, but currently leans toward opening-training material rather than pure principle chapters. |
| `how to punish early queen attacks` | Good enough for MVP: retrieves common opening mistakes and a chapter about not bringing the queen out too early. |
| `London System plans` | Strong: top results come from the London System repertoire study. |
| `King's Indian Defense ideas` | Acceptable: retrieves Indian Defense material, though some top results are adjacent repertoire chapters. |
| `Ruy Lopez opening principles` | Strong: top results come from the Ruy Lopez study and opening-training material. |
| `how to study chess openings` | Strong: top results come from the opening-training study. |
| `common beginner opening mistakes` | Good: top result is a common opening mistakes chapter. |

## Fixes made during validation

- Added `/theory/search` while keeping `/agent/search-theory` compatible.
- Updated RAG chunk metadata to prefer `ChapterName`, falling back to `Chapter`, then `unknown`.
- Updated `scripts/test_rag_queries.py` to print UTF-8 safely on Windows consoles.

## Current conclusion

The RAG is good enough to connect to the next backend flow. It is not perfect, but it retrieves relevant opening theory and keeps useful metadata: `study_id`, `category`, `chapter`, `source`, and `type`.
