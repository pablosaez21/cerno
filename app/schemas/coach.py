from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

GroundingStatus = Literal["evidence_found", "insufficient_evidence"]
EvidenceType = Literal["game_analysis", "theory"]
GenerationMode = Literal["llm", "fallback"]
GenerationReason = Literal[
    "none",
    "no_api_key",
    "provider_error",
    "validation_error",
]
CoachAction = Annotated[str, Field(min_length=1, max_length=240)]
CoachObservation = Annotated[str, Field(min_length=1, max_length=300)]


class CoachAnalyzeUserRequest(BaseModel):
    username: str = Field(min_length=1)
    limit: int = Field(default=3, ge=1, le=10)
    depth: int = Field(default=12, ge=1, le=25)
    save: bool = False


class CoachAnalyzePgnRequest(BaseModel):
    pgn: str = Field(min_length=1)
    player_color: Literal["white", "black"]
    depth: int = Field(default=12, ge=1, le=25)


class CoachDiagnosis(BaseModel):
    main_weakness: str
    secondary_weakness: str | None = None
    summary: str
    phase_stats: dict
    detected_patterns: list[str]
    recommended_focus: list[str]


class CoachCriticalMoment(BaseModel):
    game_id: str
    move_number: int
    move: str
    phase: str
    cpl: int
    classification: str


class TheoryRecommendation(BaseModel):
    citation_id: str | None = None
    source_id: str | None = None
    title: str | None = None
    source: str | None = None
    category: str | None = None
    phase: str | None = None
    study_id: str | None = None
    chapter: str | None = None
    author: str | None = None
    attribution: str | None = None
    content_license: str | None = None
    license_url: str | None = None
    reason: str
    distance: float | None = None


class CoachSourceAttribution(BaseModel):
    citation_id: str = Field(pattern=r"^S[1-9][0-9]*$")
    source_id: str
    title: str
    chapter: str | None = None
    phase: str | None = None
    category: str | None = None
    author: str | None = None
    attribution: str | None = None
    content_license: str | None = None
    license_url: str | None = None
    canonical_url: str | None = None


class GeneratedCoachRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=120)
    explanation: str = Field(min_length=1, max_length=600)
    actions: list[CoachAction] = Field(min_length=1, max_length=3)
    evidence_type: EvidenceType
    engine_evidence_ids: list[str] = Field(default_factory=list, max_length=5)
    source_ids: list[str] = Field(default_factory=list, max_length=3)

    @model_validator(mode="after")
    def validate_evidence_references(self) -> "GeneratedCoachRecommendation":
        if self.evidence_type == "theory" and not self.source_ids:
            raise ValueError(
                "A theoretical recommendation must cite at least one source."
            )
        if self.evidence_type == "game_analysis" and self.source_ids:
            raise ValueError(
                "A game-analysis recommendation cannot cite a theory source."
            )
        return self


class GeneratedCoachOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    coaching_summary: str = Field(min_length=1, max_length=1200)
    priority: str = Field(min_length=1, max_length=120)
    strengths: list[CoachObservation] = Field(default_factory=list, max_length=3)
    weaknesses: list[CoachObservation] = Field(default_factory=list, max_length=4)
    recommendations: list[GeneratedCoachRecommendation] = Field(
        min_length=1,
        max_length=4,
    )


class CoachGenerationMetadata(BaseModel):
    mode: GenerationMode
    reason: GenerationReason
    prompt_name: str
    prompt_version: str
    schema_version: str
    model: str
    retrieval_pipeline_version: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    latency_ms: int | None = None


class TrainingPlan(BaseModel):
    priority: str
    week_plan: list[str]


class CoachGameAnalysis(BaseModel):
    game_id: str
    player_color: str
    opponent: str
    result: str
    pgn: str
    total_moves: int
    summary: dict
    critical_moments: list[dict]
    phase_weaknesses: list[str]
    moves: list[dict]


class CoachAnalyzeUserResponse(BaseModel):
    username: str
    games_requested: int
    games_analyzed: int
    diagnosis: CoachDiagnosis
    coach_advice: str
    critical_moments: list[CoachCriticalMoment]
    theory_recommendations: list[TheoryRecommendation]
    grounding_status: GroundingStatus
    strengths: list[str]
    weaknesses: list[str]
    actionable_recommendations: list[GeneratedCoachRecommendation]
    sources: list[CoachSourceAttribution]
    generation: CoachGenerationMetadata
    training_plan: TrainingPlan
    game_analyses: list[CoachGameAnalysis]
    skipped_games: list[dict]
    saved: bool


class PromptEngineEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evidence_id: str
    game_id: str
    move_number: int
    move: str
    phase: str
    cpl: int
    classification: str


class PromptSourceEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    citation_id: str
    source_id: str
    title: str
    chapter: str | None = None
    retrieved_text: str
    retrieval_query: str
    phase: str | None = None
    category: str | None = None
    author: str | None = None
    attribution: str | None = None
    content_license: str | None = None
    license_url: str | None = None
    canonical_url: str | None = None


class CoachPromptInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    player_label: str
    analysis: dict[str, Any]
    engine_evidence: list[PromptEngineEvidence]
    retrieval_status: GroundingStatus
    retrieval_pipeline_version: str
    sources: list[PromptSourceEvidence]

    @model_validator(mode="after")
    def validate_retrieval_context(self) -> "CoachPromptInput":
        if self.retrieval_status == "insufficient_evidence" and self.sources:
            raise ValueError(
                "Insufficient-evidence prompt context cannot contain sources."
            )
        if self.retrieval_status == "evidence_found" and not self.sources:
            raise ValueError("Evidence-found prompt context requires sources.")
        return self
