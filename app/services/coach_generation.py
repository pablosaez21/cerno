from __future__ import annotations

import re
from dataclasses import dataclass
from time import perf_counter
from typing import Any

from openai import AsyncOpenAI
from pydantic import ValidationError

from app.core.config import settings
from app.prompts.coach import (
    COACH_OUTPUT_SCHEMA_VERSION,
    COACH_PROMPT_NAME,
    COACH_PROMPT_VERSION,
    build_coach_prompt,
)
from app.schemas.coach import (
    CoachGenerationMetadata,
    CoachPromptInput,
    GeneratedCoachOutput,
    GeneratedCoachRecommendation,
    GenerationMode,
    GenerationReason,
    PromptEngineEvidence,
    PromptSourceEvidence,
)
from app.services.rag import PIPELINE_VERSION

MAX_PROMPT_SOURCES = 5
MAX_PROMPT_SOURCE_CHARACTERS = 1800
VISIBLE_CITATION_PATTERN = re.compile(r"\bS[1-9][0-9]*\b")


@dataclass(frozen=True)
class CoachGenerationResult:
    output: GeneratedCoachOutput
    metadata: CoachGenerationMetadata


def build_prompt_input(
    *,
    username: str,
    weakness_profile: dict[str, Any],
    critical_moments: list[dict[str, Any]],
    theory_results: list[dict[str, Any]],
) -> CoachPromptInput:
    engine_evidence = [
        PromptEngineEvidence(
            evidence_id=f"E{index}",
            game_id=str(moment.get("game_id") or ""),
            move_number=int(moment.get("move_number") or 0),
            move=str(moment.get("move") or ""),
            phase=str(moment.get("phase") or "unknown"),
            cpl=int(moment.get("cpl") or 0),
            classification=str(moment.get("classification") or "unknown"),
        )
        for index, moment in enumerate(critical_moments[:8], start=1)
    ]
    sources = [
        prompt_source_from_result(result, citation_id=f"S{index}")
        for index, result in enumerate(theory_results[:MAX_PROMPT_SOURCES], start=1)
    ]
    analysis = {
        "games_analyzed": int(weakness_profile.get("games_analyzed") or 0),
        "main_weakness": str(weakness_profile.get("main_weakness") or "unknown"),
        "secondary_weakness": weakness_profile.get("secondary_weakness"),
        "phase_stats": weakness_profile.get("phase_stats", {}),
        "detected_patterns": weakness_profile.get("detected_patterns", []),
        "recommended_focus": weakness_profile.get("recommended_focus", []),
    }
    return CoachPromptInput(
        player_label=username,
        analysis=analysis,
        engine_evidence=engine_evidence,
        retrieval_status="evidence_found" if sources else "insufficient_evidence",
        retrieval_pipeline_version=PIPELINE_VERSION,
        sources=sources,
    )


def prompt_source_from_result(
    result: dict[str, Any],
    *,
    citation_id: str,
) -> PromptSourceEvidence:
    metadata = result.get("metadata") or {}
    source_id = str(
        metadata.get("source_id")
        or metadata.get("study_id")
        or metadata.get("content_hash")
        or citation_id
    )
    chapter = _optional_text(metadata.get("chapter"))
    title = _optional_text(metadata.get("study_title")) or chapter or source_id
    return PromptSourceEvidence(
        citation_id=citation_id,
        source_id=source_id,
        title=title,
        chapter=chapter,
        retrieved_text=str(result.get("text") or "")[:MAX_PROMPT_SOURCE_CHARACTERS],
        retrieval_query=str(result.get("query") or ""),
        phase=_optional_text(metadata.get("phase")),
        category=_optional_text(metadata.get("category")),
        author=_optional_text(metadata.get("author")),
        attribution=_optional_text(metadata.get("attribution_url")),
        content_license=_optional_text(metadata.get("content_license")),
        license_url=_optional_text(metadata.get("license_url")),
        canonical_url=_optional_text(
            metadata.get("source") or metadata.get("source_url")
        ),
    )


async def generate_coach_output(
    context: CoachPromptInput,
    *,
    client: Any | None = None,
) -> CoachGenerationResult:
    if client is None and not settings.openai_api_key:
        return fallback_generation(context, reason="no_api_key")

    active_client = client or AsyncOpenAI(api_key=settings.openai_api_key)
    prompt = build_coach_prompt(context)
    started_at = perf_counter()

    try:
        response = await active_client.chat.completions.parse(
            model=settings.openai_model,
            messages=prompt.messages(),
            response_format=GeneratedCoachOutput,
            temperature=0.3,
        )
    except Exception:
        return fallback_generation(context, reason="provider_error")
    latency_ms = round((perf_counter() - started_at) * 1000)

    try:
        parsed = response.choices[0].message.parsed
        output = (
            parsed
            if isinstance(parsed, GeneratedCoachOutput)
            else GeneratedCoachOutput.model_validate(parsed)
        )
        validate_grounded_output(output, context)
        output = add_insufficient_evidence_notice(output, context)
    except (AttributeError, IndexError, TypeError, ValidationError, ValueError):
        return fallback_generation(context, reason="validation_error")

    return CoachGenerationResult(
        output=output,
        metadata=generation_metadata(
            mode="llm",
            reason="none",
            retrieval_pipeline_version=context.retrieval_pipeline_version,
            input_tokens=_usage_tokens(response, "prompt_tokens"),
            output_tokens=_usage_tokens(response, "completion_tokens"),
            latency_ms=latency_ms,
        ),
    )


def validate_grounded_output(
    output: GeneratedCoachOutput,
    context: CoachPromptInput,
) -> None:
    allowed_sources = {source.citation_id for source in context.sources}
    allowed_engine_evidence = {
        evidence.evidence_id for evidence in context.engine_evidence
    }
    theoretical_recommendations = 0

    for recommendation in output.recommendations:
        unknown_sources = set(recommendation.source_ids) - allowed_sources
        if unknown_sources:
            raise ValueError(
                "Generated output cites source IDs that were not supplied."
            )
        unknown_engine_evidence = (
            set(recommendation.engine_evidence_ids) - allowed_engine_evidence
        )
        if unknown_engine_evidence:
            raise ValueError(
                "Generated output cites engine evidence IDs that were not supplied."
            )
        if recommendation.evidence_type == "theory":
            theoretical_recommendations += 1
            if context.retrieval_status == "insufficient_evidence":
                raise ValueError(
                    "Theory recommendations are forbidden without RAG evidence."
                )

    if context.retrieval_status == "evidence_found" and not theoretical_recommendations:
        raise ValueError(
            "Evidence-found output must include a cited theory recommendation."
        )

    visible_text = " ".join(
        [
            output.coaching_summary,
            *output.strengths,
            *output.weaknesses,
            *[
                text
                for recommendation in output.recommendations
                for text in [
                    recommendation.title,
                    recommendation.explanation,
                    *recommendation.actions,
                ]
            ],
        ]
    )
    if VISIBLE_CITATION_PATTERN.search(visible_text):
        raise ValueError("Citation IDs must not appear in visible prose.")


def add_insufficient_evidence_notice(
    output: GeneratedCoachOutput,
    context: CoachPromptInput,
) -> GeneratedCoachOutput:
    if context.retrieval_status != "insufficient_evidence":
        return output
    notice = (
        "No relevant theory source was available, so these recommendations "
        "are based only on the game analysis."
    )
    if notice.casefold() in output.coaching_summary.casefold():
        return output
    return output.model_copy(
        update={"coaching_summary": f"{output.coaching_summary.rstrip()} {notice}"}
    )


def fallback_generation(
    context: CoachPromptInput,
    *,
    reason: GenerationReason,
) -> CoachGenerationResult:
    output = build_fallback_output(context)
    validate_grounded_output(output, context)
    return CoachGenerationResult(
        output=output,
        metadata=generation_metadata(
            mode="fallback",
            reason=reason,
            retrieval_pipeline_version=context.retrieval_pipeline_version,
        ),
    )


def build_fallback_output(context: CoachPromptInput) -> GeneratedCoachOutput:
    main = str(context.analysis.get("main_weakness") or "middlegame")
    secondary = _optional_text(context.analysis.get("secondary_weakness"))
    patterns = [str(item) for item in context.analysis.get("detected_patterns", [])]
    best_phase = detect_best_phase(context.analysis.get("phase_stats", {}))
    weakness_text = f"your biggest evaluation losses occur in the {main}"
    if secondary:
        weakness_text += f", with additional pressure in the {secondary}"

    summary = f"The game analysis shows that {weakness_text}."
    if patterns:
        summary += f" The recurring pattern is {', '.join(patterns[:2])}."
    if context.retrieval_status == "insufficient_evidence":
        summary += (
            " No relevant theory source was available, so these recommendations "
            "are based only on the game analysis."
        )

    phase_steps = fallback_week_steps(main)
    engine_ids = (
        [context.engine_evidence[0].evidence_id] if context.engine_evidence else []
    )
    recommendations = [
        GeneratedCoachRecommendation(
            title="Review the critical decisions",
            explanation=(
                "Use the largest evaluation losses to identify the first decision "
                "that changed the position."
            ),
            actions=phase_steps[:3],
            evidence_type="game_analysis",
            engine_evidence_ids=engine_ids,
            source_ids=[],
        ),
        GeneratedCoachRecommendation(
            title=f"Build a stronger {main} routine",
            explanation=(
                "Turn the recurring game-analysis pattern into a repeatable "
                "decision process."
            ),
            actions=phase_steps[3:],
            evidence_type="game_analysis",
            engine_evidence_ids=[],
            source_ids=[],
        ),
    ]
    if context.sources:
        source = context.sources[0]
        recommendations.append(
            GeneratedCoachRecommendation(
                title=f"Connect the review to {source.title}",
                explanation=(
                    "The supplied theory source covers the diagnosed training "
                    "area and can be compared with the critical game positions."
                ),
                actions=[
                    "Read the supplied section and write down two ideas that apply "
                    "to one critical position."
                ],
                evidence_type="theory",
                engine_evidence_ids=engine_ids,
                source_ids=[source.citation_id],
            )
        )

    strengths = (
        [f"The {best_phase} was comparatively more stable in the analyzed games."]
        if best_phase and best_phase != main
        else []
    )
    weaknesses = [f"The main evaluation losses occur in the {main}."]
    weaknesses.extend(patterns[:2])
    return GeneratedCoachOutput(
        coaching_summary=summary,
        priority=f"{main} improvement",
        strengths=strengths,
        weaknesses=weaknesses,
        recommendations=recommendations,
    )


def fallback_week_steps(phase: str) -> list[str]:
    plans = {
        "opening": [
            "Day 1: review the first critical opening position.",
            "Day 2: write the correct development plan in your own words.",
            "Day 3: play three rapid games while prioritizing development and king safety.",
            "Day 4: compare those openings with the analyzed mistakes.",
            "Day 5: rehearse the corrected plans without an engine.",
        ],
        "middlegame": [
            "Day 1: solve twenty tactical positions without time pressure.",
            "Day 2: list candidate moves in the largest-loss positions.",
            "Day 3: practice king safety and piece coordination.",
            "Day 4: play three rapid games while checking forcing moves first.",
            "Day 5: group every serious error by recurring pattern.",
        ],
        "endgame": [
            "Day 1: review the largest-loss endgame position.",
            "Day 2: practice king activity in simplified positions.",
            "Day 3: repeat one rook or pawn ending technique.",
            "Day 4: play training positions from reduced material.",
            "Day 5: explain the correct plan for every critical endgame moment.",
        ],
    }
    return plans.get(phase, plans["middlegame"])


def generation_metadata(
    *,
    mode: GenerationMode,
    reason: GenerationReason,
    retrieval_pipeline_version: str,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    latency_ms: int | None = None,
) -> CoachGenerationMetadata:
    return CoachGenerationMetadata(
        mode=mode,
        reason=reason,
        prompt_name=COACH_PROMPT_NAME,
        prompt_version=COACH_PROMPT_VERSION,
        schema_version=COACH_OUTPUT_SCHEMA_VERSION,
        model=settings.openai_model,
        retrieval_pipeline_version=retrieval_pipeline_version,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
    )


def detect_best_phase(phase_stats: Any) -> str | None:
    if not isinstance(phase_stats, dict):
        return None
    candidates = [
        (str(phase), float(stats.get("avg_cpl", 0)))
        for phase, stats in phase_stats.items()
        if isinstance(stats, dict) and stats.get("moves", 0)
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda item: item[1])[0]


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _usage_tokens(response: Any, field: str) -> int | None:
    usage = getattr(response, "usage", None)
    value = getattr(usage, field, None)
    return int(value) if isinstance(value, int) else None
