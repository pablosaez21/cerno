from pydantic import BaseModel, Field


class CoachAnalyzeUserRequest(BaseModel):
    username: str = Field(min_length=1)
    limit: int = Field(default=3, ge=1, le=10)
    depth: int = Field(default=12, ge=1, le=25)
    save: bool = False


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
    source: str | None = None
    category: str | None = None
    study_id: str | None = None
    chapter: str | None = None
    reason: str
    distance: float | None = None


class TrainingPlan(BaseModel):
    priority: str
    week_plan: list[str]


class CoachAnalyzeUserResponse(BaseModel):
    username: str
    games_requested: int
    games_analyzed: int
    diagnosis: CoachDiagnosis
    critical_moments: list[CoachCriticalMoment]
    theory_recommendations: list[TheoryRecommendation]
    training_plan: TrainingPlan
    skipped_games: list[dict]
    saved: bool
