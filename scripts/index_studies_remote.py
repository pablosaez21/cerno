import argparse
import asyncio
import sys
from pathlib import Path

import httpx

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from scripts.index_studies import STUDY_GROUPS

DEFAULT_TIMEOUT_SECONDS = 60.0


async def index_remote_studies(api_base_url: str) -> None:
    base_url = api_base_url.rstrip("/")
    total_chunks = 0
    total_ok = 0
    total_failed = 0

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
        for category, study_ids in STUDY_GROUPS.items():
            print(f"\n[CATEGORY] {category} ({len(study_ids)} studies)")

            for study_id in study_ids:
                payload = {
                    "study_id": study_id,
                    "category": category,
                }

                try:
                    response = await client.post(
                        f"{base_url}/agent/index-study",
                        json=payload,
                    )
                    response.raise_for_status()
                    data = response.json()
                    chunks = int(data.get("indexed_chunks", 0))
                    total_chunks += chunks
                    total_ok += 1
                    print(f"[OK] {study_id}: {chunks} chunks")
                except Exception as exc:
                    total_failed += 1
                    print(f"[ERROR] {study_id}: {exc}")

    print("\n[DONE]")
    print(f"Studies indexed: {total_ok}")
    print(f"Studies failed: {total_failed}")
    print(f"Chunks indexed: {total_chunks}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Index the curated Lichess studies through a deployed Cerno API."
    )
    parser.add_argument(
        "--api-base-url",
        required=True,
        help="Base URL of the deployed backend, for example https://cerno-production.up.railway.app",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    asyncio.run(index_remote_studies(args.api_base_url))
