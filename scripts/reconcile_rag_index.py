"""Audit a Chroma index against the versioned source manifest."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from app.services.rag import create_chroma_collection, reconcile_index


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--collection-path",
        type=Path,
        default=ROOT_DIR / "data" / "chromadb",
    )
    parser.add_argument("--collection-name", default="chess_theory")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Delete only orphaned chunks and sources absent from the manifest.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    collection = create_chroma_collection(
        args.collection_path,
        name=args.collection_name,
    )
    report = reconcile_index(
        target_collection=collection,
        apply=args.apply,
    )
    print(json.dumps(report.model_dump(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
