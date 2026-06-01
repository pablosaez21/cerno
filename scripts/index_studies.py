import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from app.services.rag import index_study


OPENING_PRINCIPLES = [
    "ygVnJzbX",  # Opening Principles
    "NfMygq6x",  # Introduction to Opening Theory
    "vyS3PnUA",  # Opening Principles and Theory
    "6XvaoT1n",  # Opening Fundamentals
]

GENERAL_OPENINGS = [
    "qVA8CAKj",  # Common Openings
    "M17xhXZI",  # Chess Openings
    "uK53IvBH",  # Opening Main Line Trainer
    "allfhhua",  # Beginner Opening Repertoire
]

OPENING_REPERTOIRES = [
    "Utd758xx",  # Ruy Lopez
    "KjivNw7F",  # London System
    "efGLGZOM",  # King's Indian Defense
    "h4GuSZh3",  # English Opening
    "pgfDEvmk",  # Reti Opening
]

OPENING_TRAINING = [
    "yzy5Hln3",  # Learn Openings Quickly
    "oBsew7N6",  # Opening Systems
]

STUDY_GROUPS = {
    "opening_principles": OPENING_PRINCIPLES,
    "general_openings": GENERAL_OPENINGS,
    "opening_repertoire": OPENING_REPERTOIRES,
    "opening_training": OPENING_TRAINING,
}


async def main() -> None:
    total_chunks = 0
    total_ok = 0
    total_failed = 0

    for category, study_ids in STUDY_GROUPS.items():
        print(f"\n[CATEGORY] {category} ({len(study_ids)} studies)")

        for study_id in study_ids:
            try:
                print(f"[INDEXING] {study_id}")
                count = await index_study(study_id, category=category)
                total_chunks += count
                total_ok += 1
                print(f"[OK] {study_id}: {count} chunks")
            except Exception as exc:
                total_failed += 1
                print(f"[ERROR] {study_id}: {exc}")

    print("\n[DONE]")
    print(f"Studies indexed: {total_ok}")
    print(f"Studies failed: {total_failed}")
    print(f"Chunks indexed: {total_chunks}")


if __name__ == "__main__":
    asyncio.run(main())
