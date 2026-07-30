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

from app.services.rag import (
    create_chroma_collection,
    infer_phase,
    load_relevance_threshold,
)

DEFAULT_CALIBRATION_DATASET = ROOT_DIR / "evals" / "rag_calibration_queries.jsonl"
DEFAULT_EVALUATION_DATASET = ROOT_DIR / "evals" / "rag_evaluation_queries.jsonl"
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
    expected_chapters: tuple[str, ...] = ()


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
            case = GoldenCase(
                id=payload["id"],
                query=payload["query"],
                language=payload["language"],
                expected_phase=payload.get("expected_phase"),
                expected_categories=tuple(payload["expected_categories"]),
                expected_topics=tuple(payload["expected_topics"]),
                relevant_source_ids=tuple(payload["relevant_source_ids"]),
                should_answer=payload["should_answer"],
                expected_chapters=tuple(payload.get("expected_chapters", [])),
            )
            if case.language != "en":
                raise ValueError(
                    f"Cerno RAG evaluation supports English cases only: "
                    f"{path}:{line_number}."
                )
            cases.append(case)
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
    chapter = str(metadata.get("chapter") or "")
    if case.expected_chapters:
        return chapter in case.expected_chapters
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


def summarize_candidate(result: dict) -> dict:
    metadata = result.get("metadata") or {}
    return {
        "source_id": str(metadata.get("source_id") or metadata.get("study_id") or ""),
        "category": metadata.get("category"),
        "phase": metadata.get("phase"),
        "chapter": metadata.get("chapter"),
        "distance": result.get("distance"),
    }


def evaluate(
    cases: list[GoldenCase],
    *,
    collection: Any,
    mode: Literal["baseline", "final"],
    dataset: Path = DEFAULT_EVALUATION_DATASET,
) -> dict:
    rows = []
    reciprocal_ranks = []
    recall_at_1 = []
    recall_at_3 = []
    abstained_cases = []
    max_distance = load_relevance_threshold() if mode == "final" else None

    for case in cases:
        inferred_phase = infer_phase(case.query) if mode == "final" else None
        filters_applied = {"phase": inferred_phase} if inferred_phase else {}
        if mode == "baseline":
            results = raw_baseline_search(collection, case.query, 3)
            status = "evidence_found" if results else "insufficient_evidence"
        else:
            status, results = final_search(collection, case.query, 3)

        best_rejected_candidate = None
        rejection_reason = None
        diagnostic_results: list[dict] = []
        if status == "insufficient_evidence" and mode == "final":
            _, diagnostic_results = final_search(
                collection,
                case.query,
                3,
                max_distance=float("inf"),
            )
            if diagnostic_results:
                best_rejected_candidate = summarize_candidate(diagnostic_results[0])
                rejection_reason = "best_candidate_exceeds_max_distance"
            else:
                rejection_reason = "no_candidates_after_filters"
        elif status == "insufficient_evidence":
            rejection_reason = "no_baseline_candidates"

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

        visible_candidate = results[0] if results else None
        diagnostic_candidate = (
            diagnostic_results[0] if diagnostic_results else visible_candidate
        )
        candidate_metadata = (
            (diagnostic_candidate.get("metadata") or {}) if diagnostic_candidate else {}
        )
        rows.append(
            {
                "id": case.id,
                "query": case.query,
                "language": case.language,
                "should_answer": case.should_answer,
                "status": status,
                "first_relevant_rank": first_rank,
                "expected_categories": list(case.expected_categories),
                "expected_chapters": list(case.expected_chapters),
                "retrieved_category": candidate_metadata.get("category"),
                "expected_phase": case.expected_phase,
                "inferred_phase": inferred_phase,
                "retrieved_phase": candidate_metadata.get("phase"),
                "filters_applied": filters_applied,
                "rejection_reason": rejection_reason,
                "best_rejected_candidate": best_rejected_candidate,
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
        "max_distance": max_distance,
        "metrics": {
            "recall_at_1": mean(recall_at_1),
            "recall_at_3": mean(recall_at_3),
            "mrr": mean(reciprocal_ranks),
            "abstention_precision": round(abstention_precision, 4),
            "abstentions": len(abstained_cases),
        },
        "results": rows,
    }


def calibrate(
    cases: list[GoldenCase],
    *,
    collection: Any,
    dataset: Path = DEFAULT_CALIBRATION_DATASET,
) -> dict:
    """Choose a threshold from observed distances, never from intuition."""
    observations: list[dict[str, Any]] = []
    for case in cases:
        status, results = final_search(
            collection,
            case.query,
            3,
            max_distance=float("inf"),
        )
        selected_result = (
            next((result for result in results if is_relevant(case, result)), None)
            if case.should_answer
            else (results[0] if results else None)
        )
        top_distance = (
            selected_result["distance"] if selected_result is not None else None
        )
        top_candidate = (
            summarize_candidate(selected_result)
            if selected_result is not None
            else None
        )
        inferred_phase = infer_phase(case.query)
        observations.append(
            {
                "id": case.id,
                "query": case.query,
                "language": case.language,
                "should_answer": case.should_answer,
                "expected_categories": list(case.expected_categories),
                "expected_chapters": list(case.expected_chapters),
                "expected_phase": case.expected_phase,
                "inferred_phase": inferred_phase,
                "filters_applied": (
                    {"phase": inferred_phase} if inferred_phase else {}
                ),
                "filter_status": status,
                "top_distance": top_distance,
                "top_candidate": top_candidate,
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
    answerable_count = sum(case.should_answer for case in cases)
    unanswerable_count = len(cases) - answerable_count
    for threshold in distances:
        correct = 0
        answer_recall = 0
        correct_rejections = 0
        abstentions = 0
        correct_abstentions = 0
        for observation in observations:
            distance = observation["top_distance"]
            answered = distance is not None and float(distance) <= threshold
            should_answer = bool(observation["should_answer"])
            correct += int(answered == should_answer)
            answer_recall += int(answered and should_answer)
            correct_rejections += int(not answered and not should_answer)
            abstentions += int(not answered)
            correct_abstentions += int(not answered and not should_answer)
        true_positive_rate = answer_recall / answerable_count
        true_negative_rate = (
            correct_rejections / unanswerable_count if unanswerable_count else 0.0
        )
        candidates.append(
            {
                "threshold": threshold,
                "classification_accuracy": round(correct / len(cases), 4),
                "balanced_accuracy": round(
                    (true_positive_rate + true_negative_rate) / 2,
                    4,
                ),
                "answer_recall": round(true_positive_rate, 4),
                "abstention_precision": round(
                    correct_abstentions / abstentions if abstentions else 0.0,
                    4,
                ),
            }
        )

    best = sorted(
        candidates,
        key=lambda item: (
            -item["balanced_accuracy"],
            -item["classification_accuracy"],
            -item["abstention_precision"],
            -item["answer_recall"],
            item["threshold"],
        ),
    )[0]
    return {
        "dataset": display_path(dataset),
        "method": (
            "highest balanced accuracy; then classification accuracy, "
            "abstention precision, answer recall, and lowest-distance tie-break"
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
    parser.add_argument(
        "--dataset",
        type=Path,
        help=(
            "JSONL dataset. Defaults to the calibration split in calibrate mode "
            "and the held-out evaluation split otherwise."
        ),
    )
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
    dataset = args.dataset or (
        DEFAULT_CALIBRATION_DATASET
        if args.mode == "calibrate"
        else DEFAULT_EVALUATION_DATASET
    )
    cases = load_cases(dataset)
    collection = create_chroma_collection(
        args.collection_path,
        name=args.collection_name,
    )
    if args.mode == "calibrate":
        report = calibrate(cases, collection=collection, dataset=dataset)
    else:
        report = evaluate(
            cases,
            collection=collection,
            mode=args.mode,
            dataset=dataset,
        )
    rendered = json.dumps(report, ensure_ascii=True, indent=2)
    print(rendered)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(f"{rendered}\n", encoding="utf-8")


if __name__ == "__main__":
    main()
