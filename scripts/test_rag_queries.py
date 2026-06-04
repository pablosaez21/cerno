import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from app.services.rag import search_theory


TEST_QUERIES = [
    "basic opening principles",
    "how to punish early queen attacks",
    "London System plans",
    "King's Indian Defense ideas",
    "Ruy Lopez opening principles",
    "how to study chess openings",
    "common beginner opening mistakes",
]


def preview_text(text: str, max_chars: int = 300) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= max_chars:
        return cleaned
    return f"{cleaned[:max_chars]}..."


def main() -> None:
    for query in TEST_QUERIES:
        print("=" * 80)
        print(f"QUERY: {query}")
        print("-" * 80)

        results = search_theory(query, n_results=3)
        if not results:
            print("No results found.")
            continue

        for index, result in enumerate(results, start=1):
            metadata = result.get("metadata", {})
            print(f"[{index}]")
            print(f"distance: {result.get('distance')}")
            print(f"study_id: {metadata.get('study_id')}")
            print(f"category: {metadata.get('category')}")
            print(f"source: {metadata.get('source')}")
            print(f"text: {preview_text(result.get('text', ''))}")
            print()


if __name__ == "__main__":
    main()
