"""Evaluate Cerno retrieval against the versioned golden dataset."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from app.services.rag import create_chroma_collection

DEFAULT_DATASET = ROOT_DIR / "evals" / "rag_queries.jsonl"
DEFAULT_COLLECTION_PATH = ROOT_DIR / "data" / "chromadb"


@dataclass(frozen=True)
class GoldenCase:
    id: str
    query: str
    language: str
    expected_phase: str | None
    expected_categories: tuple[str, ...]
    expected_topics: tuple[str, ...]
    relevant_source_ids: tuple[str, ...]
    should_answer: bool


def load_cases(path: Path) -> list[GoldenCase]:
    cases = []
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(),
        start=1,
    ):
        if not line.strip():
            continue
        payload = json.loads(line)
        try:
            cases.append(
                GoldenCase(
                    id=payload["id"],
                    query=payload["query"],
                    language=payload["language"],
                    expected_phase=payload.get("expected_phase"),
                    expected_categories=tuple(payload["expected_categories"]),
                    expected_topics=tuple(payload["expected_topics"]),
                    relevant_source_ids=tuple(payload["relevant_source_ids"]),
                    should_answer=payload["should_answer"],
                )
            )
        except (KeyError, TypeError) as exc:
            raise ValueError(f"Invalid golden case at {path}:{line_number}.") from exc
    if not cases:
        raise ValueError(f"Golden dataset is empty: {path}.")
    return cases


def raw_baseline_search(collection: Any, query: str, n_results: int) -> list[dict]:
    """Reproduce the pre-Phase-3 always-return-neighbours baseline."""
    if collection.count() == 0:
        return []
    payload = collection.query(query_texts=[query], n_results=n_results)
    documents = (payload.get("documents") or [[]])[0]
    metadatas = (payload.get("metadatas") or [[]])[0]
    distances = (payload.get("distances") or [[]])[0]
    return [
        {"text": document, "metadata": metadata or {}, "distance": distance}
        for document, metadata, distance in zip(
            documents,
            metadatas,
            distances,
            strict=False,
        )
    ]


def final_search(
    collection: Any,
    query: str,
    n_results: int,
    *,
    max_distance: float | None = None,
) -> tuple[str, list[dict]]:
    from app.services.rag import retrieve_theory

    result = retrieve_theory(
        query,
        n_results=n_results,
        max_distance=max_distance,
        target_collection=collection,
    )
    return result.status, [document.model_dump() for document in result.documents]


def is_relevant(case: GoldenCase, result: dict) -> bool:
    metadata = result.get("metadata") or {}
    source_id = str(metadata.get("study_id") or metadata.get("source_id") or "")
    category = str(metadata.get("category") or "")
    topic = str(metadata.get("topic") or "")
    return (
        source_id in case.relevant_source_ids
        or category in case.expected_categories
        or any(
            expected.casefold() in topic.casefold() for expected in case.expected_topics
        )
    )


def evaluate(
    cases: list[GoldenCase],
    *,
    collection: Any,
    mode: Literal["baseline", "final"],
    dataset: Path = DEFAULT_DATASET,
) -> dict:
    rows = []
    reciprocal_ranks = []
    recall_at_1 = []
    recall_at_3 = []
    abstained_cases = []

    for case in cases:
        if mode == "baseline":
            results = raw_baseline_search(collection, case.query, 3)
            status = "evidence_found" if results else "insufficient_evidence"
        else:
            status, results = final_search(collection, case.query, 3)

        relevant_ranks = [
            rank
            for rank, result in enumerate(results, start=1)
            if is_relevant(case, result)
        ]
        first_rank = min(relevant_ranks, default=None)
        if case.should_answer:
            recall_at_1.append(float(first_rank == 1))
            recall_at_3.append(float(first_rank is not None and first_rank <= 3))
            reciprocal_ranks.append(1 / first_rank if first_rank else 0.0)
        if status == "insufficient_evidence":
            abstained_cases.append(case)

        rows.append(
            {
                "id": case.id,
                "should_answer": case.should_answer,
                "status": status,
                "first_relevant_rank": first_rank,
                "top_distance": results[0].get("distance") if results else None,
                "top_source": (
                    (results[0].get("metadata") or {}).get("study_id")
                    if results
                    else None
                ),
                "top_category": (
                    (results[0].get("metadata") or {}).get("category")
                    if results
                    else None
                ),
            }
        )

    correct_abstentions = sum(not case.should_answer for case in abstained_cases)
    abstention_precision = (
        correct_abstentions / len(abstained_cases) if abstained_cases else 0.0
    )
    return {
        "mode": mode,
        "dataset": display_path(dataset),
        "cases": len(cases),
        "answerable_cases": sum(case.should_answer for case in cases),
        "unanswerable_cases": sum(not case.should_answer for case in cases),
        "metrics": {
            "recall_at_1": mean(recall_at_1),
            "recall_at_3": mean(recall_at_3),
            "mrr": mean(reciprocal_ranks),
            "abstention_precision": round(abstention_precision, 4),
            "abstentions": len(abstained_cases),
        },
        "results": rows,
    }


def calibrate(cases: list[GoldenCase], *, collection: Any) -> dict:
    """Choose a threshold from observed distances, never from intuition."""
    observations = []
    for case in cases:
        status, results = final_search(
            collection,
            case.query,
            1,
            max_distance=float("inf"),
        )
        top_distance = results[0]["distance"] if results else None
        observations.append(
            {
                "id": case.id,
                "should_answer": case.should_answer,
                "filter_status": status,
                "top_distance": top_distance,
            }
        )

    distances = sorted(
        {
            float(observation["top_distance"])
            for observation in observations
            if observation["top_distance"] is not None
        }
    )
    if not distances:
        raise ValueError("Cannot calibrate an empty or fully filtered index.")

    candidates = []
    for threshold in distances:
        correct = 0
        answer_recall = 0
        abstentions = 0
        correct_abstentions = 0
        for observation in observations:
            distance = observation["top_distance"]
            answered = distance is not None and float(distance) <= threshold
            should_answer = bool(observation["should_answer"])
            correct += int(answered == should_answer)
            answer_recall += int(answered and should_answer)
            abstentions += int(not answered)
            correct_abstentions += int(not answered and not should_answer)
        candidates.append(
            {
                "threshold": threshold,
                "classification_accuracy": round(correct / len(cases), 4),
                "answer_recall": round(
                    answer_recall / sum(case.should_answer for case in cases),
                    4,
                ),
                "abstention_precision": round(
                    correct_abstentions / abstentions if abstentions else 0.0,
                    4,
                ),
            }
        )

    best = sorted(
        candidates,
        key=lambda item: (
            -item["classification_accuracy"],
            -item["answer_recall"],
            item["threshold"],
        ),
    )[0]
    return {
        "dataset": display_path(DEFAULT_DATASET),
        "method": (
            "highest classification accuracy; then answer recall; "
            "then lowest-distance conservative tie-break"
        ),
        "recommended": best,
        "observations": observations,
        "candidates": candidates,
    }


def display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT_DIR).as_posix()
    except ValueError:
        return str(path.resolve())


def mean(values: list[float]) -> float:
    return round(sum(values) / len(values), 4) if values else 0.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mode",
        choices=("baseline", "final", "calibrate"),
        default="final",
        help="Evaluate a retrieval version or derive the relevance threshold.",
    )
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument(
        "--collection-path",
        type=Path,
        default=DEFAULT_COLLECTION_PATH,
    )
    parser.add_argument("--collection-name", default="chess_theory")
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cases = load_cases(args.dataset)
    collection = create_chroma_collection(
        args.collection_path,
        name=args.collection_name,
    )
    if args.mode == "calibrate":
        report = calibrate(cases, collection=collection)
    else:
        report = evaluate(
            cases,
            collection=collection,
            mode=args.mode,
            dataset=args.dataset,
        )
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    print(rendered)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(f"{rendered}\n", encoding="utf-8")


if __name__ == "__main__":
    main()
