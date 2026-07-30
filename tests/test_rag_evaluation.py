from pathlib import Path
from unittest.mock import patch

import pytest

from scripts.evaluate_rag import (
    GoldenCase,
    calibrate,
    evaluate,
    is_relevant,
    load_cases,
)


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


def test_golden_dataset_rejects_non_english_cases(tmp_path: Path):
    dataset = tmp_path / "non-english.jsonl"
    dataset.write_text(
        (
            '{"id":"fixture","query":"consulta","language":"es",'
            '"expected_phase":null,"expected_categories":[],'
            '"expected_topics":[],"relevant_source_ids":[],'
            '"should_answer":false}\n'
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="supports English cases only"):
        load_cases(dataset)


def test_expected_chapter_prevents_a_broad_same_category_match():
    case = GoldenCase(
        id="rook-ending-chapter",
        query="How should two connected pawns advance in a rook ending?",
        language="en",
        expected_phase="endgame",
        expected_categories=("rook_endgames",),
        expected_topics=("connected pawns",),
        relevant_source_ids=("rook-source",),
        expected_chapters=("Two Pawns and Rook vs. Rook",),
        should_answer=True,
    )

    assert not is_relevant(
        case,
        {
            "metadata": {
                "source_id": "rook-source",
                "category": "rook_endgames",
                "chapter": "Introduction",
            }
        },
    )
    assert is_relevant(
        case,
        {
            "metadata": {
                "source_id": "rook-source",
                "category": "rook_endgames",
                "chapter": "Two Pawns and Rook vs. Rook",
            }
        },
    )


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


def test_final_evaluation_explains_the_best_rejected_candidate():
    case = GoldenCase(
        id="unsupported-rook-method",
        query="Which rook endgame method is unsupported?",
        language="en",
        expected_phase="endgame",
        expected_categories=(),
        expected_topics=(),
        relevant_source_ids=(),
        should_answer=False,
    )
    rejected = {
        "text": "Nearest but rejected evidence.",
        "metadata": {
            "source_id": "rook-source",
            "category": "rook_endgames",
            "phase": "endgame",
            "chapter": "Rook activity",
        },
        "distance": 1.5,
    }

    with patch(
        "scripts.evaluate_rag.final_search",
        side_effect=[
            ("insufficient_evidence", []),
            ("evidence_found", [rejected]),
        ],
    ):
        report = evaluate(
            [case],
            collection=object(),
            mode="final",
            dataset=Path("evaluation-fixture.jsonl"),
        )

    row = report["results"][0]
    assert row["filters_applied"] == {"phase": "endgame"}
    assert row["expected_categories"] == []
    assert row["retrieved_category"] == "rook_endgames"
    assert row["expected_phase"] == "endgame"
    assert row["retrieved_phase"] == "endgame"
    assert row["rejection_reason"] == "best_candidate_exceeds_max_distance"
    assert row["best_rejected_candidate"] == {
        "source_id": "rook-source",
        "category": "rook_endgames",
        "phase": "endgame",
        "chapter": "Rook activity",
        "distance": 1.5,
    }


def test_calibration_selects_measured_conservative_threshold():
    cases = [
        golden_case("answerable", should_answer=True),
        golden_case("unsupported", should_answer=False),
    ]

    with patch(
        "scripts.evaluate_rag.final_search",
        side_effect=[
            (
                "evidence_found",
                [
                    {
                        "distance": 0.4,
                        "metadata": {"category": "opening_principles"},
                    }
                ],
            ),
            ("evidence_found", [{"distance": 0.9}]),
        ],
    ):
        report = calibrate(
            cases,
            collection=object(),
            dataset=Path("calibration-fixture.jsonl"),
        )

    assert report["dataset"].endswith("calibration-fixture.jsonl")
    assert report["recommended"] == {
        "threshold": 0.4,
        "classification_accuracy": 1.0,
        "balanced_accuracy": 1.0,
        "answer_recall": 1.0,
        "abstention_precision": 1.0,
    }
