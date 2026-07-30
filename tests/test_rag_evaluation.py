from pathlib import Path
from unittest.mock import patch

from scripts.evaluate_rag import GoldenCase, calibrate, evaluate


def golden_case(
    case_id: str,
    *,
    should_answer: bool,
) -> GoldenCase:
    return GoldenCase(
        id=case_id,
        query=case_id,
        language="en",
        expected_phase="opening" if should_answer else None,
        expected_categories=("opening_principles",) if should_answer else (),
        expected_topics=(),
        relevant_source_ids=(),
        should_answer=should_answer,
    )


class BaselineCollection:
    def count(self) -> int:
        return 1

    def query(self, *, query_texts: list[str], n_results: int) -> dict:
        del n_results
        category = (
            "opening_principles"
            if query_texts[0] == "answerable"
            else "opening_repertoire"
        )
        return {
            "documents": [["Fixture"]],
            "metadatas": [[{"category": category}]],
            "distances": [[0.2]],
        }


def test_evaluation_calculates_ranking_and_baseline_abstention_metrics():
    report = evaluate(
        [
            golden_case("answerable", should_answer=True),
            golden_case("unsupported", should_answer=False),
        ],
        collection=BaselineCollection(),
        mode="baseline",
        dataset=Path("fixture.jsonl"),
    )

    assert report["metrics"] == {
        "recall_at_1": 1.0,
        "recall_at_3": 1.0,
        "mrr": 1.0,
        "abstention_precision": 0.0,
        "abstentions": 0,
    }


def test_calibration_selects_measured_conservative_threshold():
    cases = [
        golden_case("answerable", should_answer=True),
        golden_case("unsupported", should_answer=False),
    ]

    with patch(
        "scripts.evaluate_rag.final_search",
        side_effect=[
            ("evidence_found", [{"distance": 0.4}]),
            ("evidence_found", [{"distance": 0.9}]),
        ],
    ):
        report = calibrate(cases, collection=object())

    assert report["recommended"] == {
        "threshold": 0.4,
        "classification_accuracy": 1.0,
        "answer_recall": 1.0,
        "abstention_precision": 1.0,
    }
