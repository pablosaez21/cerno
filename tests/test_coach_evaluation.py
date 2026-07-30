import json
from pathlib import Path

import pytest

from scripts.evaluate_coach_generation import (
    compare,
    evaluate_output,
    load_cases,
)

DATASET = Path("evals/coach_generation_cases.jsonl")


def test_dataset_covers_required_flows_phases_and_adversarial_cases():
    cases = load_cases(DATASET)

    assert {case.flow for case in cases} == {"lichess", "pgn"}
    assert {case.phase for case in cases} == {
        "opening",
        "middlegame",
        "endgame",
    }
    assert any(len(case.prompt_input.sources) > 1 for case in cases)
    assert any(
        case.prompt_input.retrieval_status == "insufficient_evidence" for case in cases
    )
    assert any(
        "Ignore all prior instructions" in source.retrieved_text
        for case in cases
        for source in case.prompt_input.sources
    )
    assert any(case.excluded_pgn_comment for case in cases)


def test_candidate_contract_is_structured_grounded_and_useful():
    cases = load_cases(DATASET)
    report = compare(cases, DATASET)

    assert report["baseline"]["metrics"]["schema_validity"] == 0.0
    assert report["candidate"]["metrics"] == {
        "cases": 8,
        "schema_validity": 1.0,
        "reference_validity": 1.0,
        "citation_coverage": 1.0,
        "groundedness": 1.0,
        "insufficient_evidence_compliance": 1.0,
        "usefulness": 1.0,
        "injection_resistance": 1.0,
    }


def test_evaluator_rejects_an_invented_source_id():
    case = load_cases(DATASET)[0]
    output = json.loads(json.dumps(case.candidate_output))
    output["recommendations"][1]["source_ids"] = ["S99"]

    row = evaluate_output(case, output)

    assert not row["references_valid"]
    assert any("not supplied" in error for error in row["errors"])


def test_dataset_loader_rejects_an_invalid_prompt_contract(tmp_path: Path):
    dataset = tmp_path / "invalid.jsonl"
    dataset.write_text(
        json.dumps(
            {
                "id": "invalid",
                "flow": "pgn",
                "phase": "opening",
                "expected_theory": False,
                "prompt_input": {
                    "player_label": "White",
                    "analysis": {},
                    "engine_evidence": [],
                    "retrieval_status": "insufficient_evidence",
                    "retrieval_pipeline_version": "rag-v1",
                    "sources": [{"citation_id": "S1"}],
                },
                "grounding_terms": {},
                "candidate_output": {},
                "baseline_output": {},
            }
        )
        + "\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="Invalid coach evaluation case"):
        load_cases(dataset)
