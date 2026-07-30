"""Build or update the manifest-controlled chess theory index."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from app.services.rag import (
    chunks_for_source,
    create_chroma_collection,
    fetch_source,
    load_manifest,
    reconcile_index,
    reindex_source,
)

STUDY_GROUPS: dict[str, list[str]] = {}
for manifest_source in load_manifest().sources:
    STUDY_GROUPS.setdefault(manifest_source.category, []).append(manifest_source.id)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--collection-path",
        type=Path,
        default=ROOT_DIR / "data" / "chromadb",
    )
    parser.add_argument("--collection-name", default="chess_theory")
    parser.add_argument(
        "--no-reconcile",
        action="store_true",
        help="Do not remove content that is absent from the source manifest.",
    )
    return parser.parse_args()


async def build_index(args: argparse.Namespace) -> int:
    manifest = load_manifest()
    collection = create_chroma_collection(
        args.collection_path,
        name=args.collection_name,
    )
    reports = []
    failures = []

    for source in manifest.sources:
        if not source.enabled:
            continue
        try:
            source_text = await fetch_source(source)
            chunks = chunks_for_source(source_text, source)
            report = reindex_source(
                chunks,
                source.id,
                target_collection=collection,
            )
            reports.append(report.model_dump())
            print(
                f"[OK] {source.id}: {report.indexed_chunks} chunks "
                f"({report.stale_chunks_deleted} stale deleted)"
            )
        except Exception as exc:
            failures.append({"source_id": source.id, "error": str(exc)})
            print(f"[ERROR] {source.id}: {exc}")

    reconciliation = reconcile_index(
        manifest,
        target_collection=collection,
        apply=not args.no_reconcile,
    )
    summary = {
        "collection_path": str(args.collection_path.resolve()),
        "sources_indexed": len(reports),
        "sources_failed": failures,
        "chunks_indexed": sum(report["indexed_chunks"] for report in reports),
        "source_reports": reports,
        "reconciliation": reconciliation.model_dump(),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if failures else 0


def main() -> None:
    args = parse_args()
    raise SystemExit(asyncio.run(build_index(args)))


if __name__ == "__main__":
    main()
