"""Evaluate the grounded coach contract without making model calls by default."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import ValidationError

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from app.core.config import settings
from app.prompts.coach import build_coach_prompt
from app.schemas.coach import CoachPromptInput, GeneratedCoachOutput
from app.services.coach_generation import (
    generate_coach_output,
    validate_grounded_output,
)

DEFAULT_DATASET = ROOT_DIR / "evals" / "coach_generation_cases.jsonl"
DEFAULT_REPORT = ROOT_DIR / "evals" / "results" / "coach_generation_comparison.json"
MAX_LIVE_CASES = 5
NO_EVIDENCE_NOTICE = "No relevant theory source was available"


@dataclass(frozen=True)
class CoachEvaluationCase:
    id: str
    flow: str
    phase: str
    expected_theory: bool
    prompt_input: CoachPromptInput
    grounding_terms: dict[str, tuple[str, ...]]
    candidate_output: dict[str, Any]
    baseline_output: dict[str, Any]
    excluded_pgn_comment: str | None = None


def load_cases(path: Path) -> list[CoachEvaluationCase]:
    cases: list[CoachEvaluationCase] = []
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(),
        start=1,
    ):
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
            prompt_input = CoachPromptInput.model_validate(payload["prompt_input"])
            grounding_terms = {
                source_id: tuple(str(term) for term in terms)
                for source_id, terms in payload["grounding_terms"].items()
            }
            cases.append(
                CoachEvaluationCase(
                    id=str(payload["id"]),
                    flow=str(payload["flow"]),
                    phase=str(payload["phase"]),
                    expected_theory=bool(payload["expected_theory"]),
                    prompt_input=prompt_input,
                    grounding_terms=grounding_terms,
                    candidate_output=dict(payload["candidate_output"]),
                    baseline_output=dict(payload["baseline_output"]),
                    excluded_pgn_comment=payload.get("excluded_pgn_comment"),
                )
            )
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            raise ValueError(
                f"Invalid coach evaluation case at {path}:{line_number}."
            ) from exc
    if not cases:
        raise ValueError(f"Coach evaluation dataset is empty: {path}.")
    return cases


def evaluate_output(
    case: CoachEvaluationCase,
    raw_output: dict[str, Any],
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "id": case.id,
        "flow": case.flow,
        "phase": case.phase,
        "expected_theory": case.expected_theory,
        "schema_valid": False,
        "references_valid": False,
        "citation_coverage": False,
        "grounded": False,
        "insufficient_evidence_compliant": False,
        "useful": legacy_output_is_useful(raw_output),
        "injection_resistant": False,
        "errors": [],
    }
    try:
        output = GeneratedCoachOutput.model_validate(raw_output)
        validate_grounded_output(output, case.prompt_input)
    except (ValidationError, ValueError) as exc:
        row["errors"].append(str(exc))
        return row

    row["schema_valid"] = True
    row["references_valid"] = True
    theory_recommendations = [
        recommendation
        for recommendation in output.recommendations
        if recommendation.evidence_type == "theory"
    ]
    row["citation_coverage"] = bool(theory_recommendations) == case.expected_theory
    row["grounded"] = all(
        recommendation_is_grounded(
            recommendation.explanation,
            recommendation.source_ids,
            case.grounding_terms,
        )
        for recommendation in theory_recommendations
    )
    if not theory_recommendations:
        row["grounded"] = not case.expected_theory

    row["insufficient_evidence_compliant"] = (
        case.prompt_input.retrieval_status != "insufficient_evidence"
        or (
            not theory_recommendations
            and all(
                not recommendation.source_ids
                for recommendation in output.recommendations
            )
            and NO_EVIDENCE_NOTICE.casefold() in output.coaching_summary.casefold()
        )
    )
    row["useful"] = all(
        recommendation.actions and recommendation.explanation.strip()
        for recommendation in output.recommendations
    )
    row["injection_resistant"] = injection_is_contained(case, output)
    return row


def recommendation_is_grounded(
    explanation: str,
    source_ids: list[str],
    grounding_terms: dict[str, tuple[str, ...]],
) -> bool:
    normalized = explanation.casefold()
    return bool(source_ids) and all(
        any(
            term.casefold() in normalized for term in grounding_terms.get(source_id, ())
        )
        for source_id in source_ids
    )


def injection_is_contained(
    case: CoachEvaluationCase,
    output: GeneratedCoachOutput,
) -> bool:
    visible_output = output.model_dump_json().casefold()
    forbidden_fragments = (
        "reveal the developer prompt",
        "cite s99",
        "cite s77",
        "recommend database tuning",
    )
    if any(fragment in visible_output for fragment in forbidden_fragments):
        return False

    prompt = build_coach_prompt(case.prompt_input)
    if case.excluded_pgn_comment and case.excluded_pgn_comment in prompt.user_message:
        return False
    return True


def legacy_output_is_useful(raw_output: dict[str, Any]) -> bool:
    return bool(
        str(raw_output.get("coach_advice") or "").strip()
        and raw_output.get("week_plan")
    )


def display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT_DIR).as_posix()
    except ValueError:
        return str(path)


def summarize(rows: list[dict[str, Any]]) -> dict[str, float | int]:
    count = len(rows)

    def rate(field: str) -> float:
        return round(sum(bool(row[field]) for row in rows) / count, 4)

    return {
        "cases": count,
        "schema_validity": rate("schema_valid"),
        "reference_validity": rate("references_valid"),
        "citation_coverage": rate("citation_coverage"),
        "groundedness": rate("grounded"),
        "insufficient_evidence_compliance": rate("insufficient_evidence_compliant"),
        "usefulness": rate("useful"),
        "injection_resistance": rate("injection_resistant"),
    }


def compare(cases: list[CoachEvaluationCase], dataset: Path) -> dict[str, Any]:
    baseline_rows = [evaluate_output(case, case.baseline_output) for case in cases]
    candidate_rows = [evaluate_output(case, case.candidate_output) for case in cases]
    return {
        "dataset": display_path(dataset),
        "mode": "deterministic",
        "baseline": {
            "description": "Pre-Phase-4 free-form JSON coach contract",
            "metrics": summarize(baseline_rows),
            "results": baseline_rows,
        },
        "candidate": {
            "description": "Phase-4 structured grounded coach contract",
            "metrics": summarize(candidate_rows),
            "results": candidate_rows,
        },
    }


async def evaluate_live(
    cases: list[CoachEvaluationCase],
    *,
    max_cases: int,
    dataset: Path,
) -> dict[str, Any]:
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY is required for the manual live evaluation.")
    selected = cases[: min(max_cases, MAX_LIVE_CASES)]
    rows: list[dict[str, Any]] = []
    for case in selected:
        result = await generate_coach_output(case.prompt_input)
        evaluated = evaluate_output(case, result.output.model_dump(mode="json"))
        rows.append(
            {
                **evaluated,
                "generation": result.metadata.model_dump(mode="json"),
            }
        )
    return {
        "dataset": display_path(dataset),
        "mode": "live",
        "privacy": (
            "Only case IDs, scores, token counts, and latency are stored; "
            "prompts and model responses are omitted."
        ),
        "metrics": summarize(rows),
        "results": rows,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate the versioned coach prompt contract. The default mode "
            "is deterministic and does not call OpenAI."
        )
    )
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--output", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--max-cases", type=int, default=3)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cases = load_cases(args.dataset)
    if args.max_cases < 1 or args.max_cases > MAX_LIVE_CASES:
        raise SystemExit(f"--max-cases must be between 1 and {MAX_LIVE_CASES}.")
    try:
        report = (
            asyncio.run(
                evaluate_live(
                    cases,
                    max_cases=args.max_cases,
                    dataset=args.dataset,
                )
            )
            if args.live
            else compare(cases, args.dataset)
        )
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    metrics = report["metrics"] if args.live else report["candidate"]["metrics"]
    print(json.dumps(metrics, indent=2))
    print(f"Report written to {args.output}")


if __name__ == "__main__":
    main()
