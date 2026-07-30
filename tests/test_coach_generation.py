import asyncio
from types import SimpleNamespace

import pytest

from app.schemas.coach import (
    CoachPromptInput,
    GeneratedCoachOutput,
    GeneratedCoachRecommendation,
    PromptEngineEvidence,
    PromptSourceEvidence,
)
from app.services.coach_generation import (
    fallback_generation,
    generate_coach_output,
    validate_grounded_output,
)


def prompt_context(*, with_source: bool = True) -> CoachPromptInput:
    sources = (
        [
            PromptSourceEvidence(
                citation_id="S1",
                source_id="source-1",
                title="Pawn Endings",
                chapter="The Opposition",
                retrieved_text="The opposition controls access to key squares.",
                retrieval_query="opposition in pawn endings",
                phase="endgame",
                category="pawn_endgames",
                author="Wikibooks contributors",
                attribution="https://example.test/history",
                content_license="CC BY-SA 4.0",
                license_url="https://creativecommons.org/licenses/by-sa/4.0/",
                canonical_url="https://example.test/pawn-endings",
            )
        ]
        if with_source
        else []
    )
    return CoachPromptInput(
        player_label="FixturePlayer",
        analysis={
            "main_weakness": "endgame",
            "phase_stats": {
                "opening": {"moves": 4, "avg_cpl": 20},
                "endgame": {"moves": 3, "avg_cpl": 90},
            },
            "detected_patterns": ["late king activity"],
        },
        engine_evidence=[
            PromptEngineEvidence(
                evidence_id="E1",
                game_id="game-1",
                move_number=42,
                move="Kf3",
                phase="endgame",
                cpl=190,
                classification="mistake",
            )
        ],
        retrieval_status=("evidence_found" if with_source else "insufficient_evidence"),
        retrieval_pipeline_version="rag-v1",
        sources=sources,
    )


def valid_output() -> GeneratedCoachOutput:
    return GeneratedCoachOutput(
        coaching_summary="The endgame review shows that king activity came too late.",
        priority="king activity in pawn endings",
        strengths=["The opening was comparatively stable."],
        weaknesses=["King activity was delayed in the critical ending."],
        recommendations=[
            GeneratedCoachRecommendation(
                title="Review the critical king move",
                explanation="The evaluation loss begins when the king stays passive.",
                actions=["Replay the position and compare two king moves."],
                evidence_type="game_analysis",
                engine_evidence_ids=["E1"],
                source_ids=[],
            ),
            GeneratedCoachRecommendation(
                title="Practice opposition",
                explanation="Opposition helps a king control access to key squares.",
                actions=["Solve five opposition positions from both sides."],
                evidence_type="theory",
                engine_evidence_ids=["E1"],
                source_ids=["S1"],
            ),
        ],
    )


class FakeCompletions:
    def __init__(self, parsed):
        self.parsed = parsed
        self.kwargs = None

    async def parse(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(parsed=self.parsed),
                )
            ]
        )


class FakeClient:
    def __init__(self, parsed):
        self.completions = FakeCompletions(parsed)
        self.chat = SimpleNamespace(completions=self.completions)


class FailingCompletions:
    async def parse(self, **kwargs):
        del kwargs
        raise RuntimeError("provider fixture failure")


def test_structured_output_is_parsed_and_citations_are_validated():
    client = FakeClient(valid_output())

    result = asyncio.run(generate_coach_output(prompt_context(), client=client))

    assert result.metadata.mode == "llm"
    assert result.metadata.reason == "none"
    assert result.output.recommendations[1].source_ids == ["S1"]
    assert client.completions.kwargs["response_format"] is GeneratedCoachOutput
    assert client.completions.kwargs["temperature"] == 0.3
    messages = client.completions.kwargs["messages"]
    assert messages[0]["role"] == "developer"
    assert messages[1]["role"] == "user"


def test_invented_citation_is_rejected_and_falls_back():
    payload = valid_output().model_dump()
    payload["recommendations"][1]["source_ids"] = ["S99"]

    result = asyncio.run(
        generate_coach_output(
            prompt_context(),
            client=FakeClient(payload),
        )
    )

    assert result.metadata.mode == "fallback"
    assert result.metadata.reason == "validation_error"
    assert all(
        set(recommendation.source_ids) <= {"S1"}
        for recommendation in result.output.recommendations
    )


def test_theoretical_recommendation_without_citation_is_rejected():
    payload = valid_output().model_dump()
    payload["recommendations"][1]["source_ids"] = []

    result = asyncio.run(
        generate_coach_output(
            prompt_context(),
            client=FakeClient(payload),
        )
    )

    assert result.metadata.mode == "fallback"
    assert result.metadata.reason == "validation_error"


def test_insufficient_evidence_keeps_game_coaching_without_citations():
    context = prompt_context(with_source=False)
    payload = valid_output().model_dump()
    payload["recommendations"] = [payload["recommendations"][0]]
    payload["coaching_summary"] = "The endgame king became active too late."

    result = asyncio.run(generate_coach_output(context, client=FakeClient(payload)))

    assert result.metadata.mode == "llm"
    assert "No relevant theory source was available" in (result.output.coaching_summary)
    assert all(
        recommendation.evidence_type == "game_analysis"
        and recommendation.source_ids == []
        for recommendation in result.output.recommendations
    )


def test_theory_is_forbidden_under_insufficient_evidence():
    result = asyncio.run(
        generate_coach_output(
            prompt_context(with_source=False),
            client=FakeClient(valid_output()),
        )
    )

    assert result.metadata.mode == "fallback"
    assert result.metadata.reason == "validation_error"
    assert all(
        recommendation.evidence_type == "game_analysis"
        for recommendation in result.output.recommendations
    )


def test_malformed_model_response_uses_observable_fallback():
    result = asyncio.run(
        generate_coach_output(
            prompt_context(),
            client=FakeClient({"coaching_summary": "Incomplete"}),
        )
    )

    assert result.metadata.mode == "fallback"
    assert result.metadata.reason == "validation_error"
    assert result.output.recommendations


def test_provider_failure_uses_observable_fallback():
    client = SimpleNamespace(chat=SimpleNamespace(completions=FailingCompletions()))

    result = asyncio.run(generate_coach_output(prompt_context(), client=client))

    assert result.metadata.mode == "fallback"
    assert result.metadata.reason == "provider_error"
    assert result.output.recommendations


def test_visible_source_ids_are_rejected():
    output = valid_output().model_copy(
        update={"coaching_summary": "Read S1 because it is authoritative."}
    )

    with pytest.raises(ValueError, match="must not appear in visible prose"):
        validate_grounded_output(output, prompt_context())


def test_no_api_key_fallback_is_grounded_when_sources_exist():
    result = fallback_generation(prompt_context(), reason="no_api_key")

    assert result.metadata.mode == "fallback"
    assert result.metadata.reason == "no_api_key"
    theory = [
        recommendation
        for recommendation in result.output.recommendations
        if recommendation.evidence_type == "theory"
    ]
    assert theory and theory[0].source_ids == ["S1"]
