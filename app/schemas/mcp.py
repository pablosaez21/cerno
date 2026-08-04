from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ChessPhase = Literal["opening", "middlegame", "endgame", "unknown"]
PlayerColor = Literal["white", "black"]
AnalysisScope = Literal["full_game", "player"]
McpToolStatus = Literal["success", "error"]
McpErrorCode = Literal[
    "invalid_request",
    "invalid_pgn",
    "user_not_found",
    "rate_limited",
    "timeout",
    "dependency_unavailable",
    "analysis_failed",
    "retrieval_failed",
]


class McpToolError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: McpErrorCode
    message: str
    retry_after_seconds: int | None = Field(default=None, ge=1)


class PhasePerformance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phase: ChessPhase
    moves: int = Field(ge=0)
    average_centipawn_loss: float = Field(ge=0)
    inaccuracies: int = Field(ge=0)
    mistakes: int = Field(ge=0)
    blunders: int = Field(ge=0)


class AnalysisMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    games_analyzed: int = Field(ge=1, le=3)
    total_plies: int = Field(ge=0)
    evaluated_moves: int = Field(ge=0)
    average_centipawn_loss: float = Field(ge=0)
    inaccuracies: int = Field(ge=0)
    mistakes: int = Field(ge=0)
    blunders: int = Field(ge=0)


class CompactCriticalMoment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    game_id: str | None = None
    move_number: int = Field(ge=1)
    move: str
    mover_color: PlayerColor | None = None
    phase: ChessPhase
    centipawn_loss: int = Field(ge=0)
    classification: str


class CompactRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    actions: list[str] = Field(default_factory=list, max_length=3)
    evidence_type: Literal["game_analysis", "theory"]
    study_urls: list[str] = Field(default_factory=list, max_length=3)


class StudyReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    chapter: str | None = None
    phase: ChessPhase | None = None
    category: str | None = None
    author: str | None = None
    attribution: str | None = None
    url: str | None = None


class CompactAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: str
    scope: AnalysisScope
    player_color: PlayerColor | None = None
    metrics: AnalysisMetrics
    performance_by_phase: list[PhasePerformance] = Field(max_length=3)
    priority_phase: ChessPhase | None = None
    secondary_phase: ChessPhase | None = None
    weaknesses: list[str] = Field(default_factory=list, max_length=4)
    patterns: list[str] = Field(default_factory=list, max_length=5)
    critical_moments: list[CompactCriticalMoment] = Field(
        default_factory=list,
        max_length=10,
    )
    recommendations: list[CompactRecommendation] = Field(
        default_factory=list,
        max_length=4,
    )
    studies: list[StudyReference] = Field(default_factory=list, max_length=3)
    skipped_games: int = Field(default=0, ge=0)


class TheoryStudyEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    chapter: str | None = None
    fragment: str = Field(max_length=1200)
    phase: ChessPhase | None = None
    category: str | None = None
    author: str | None = None
    attribution: str | None = None
    url: str | None = None
    distance: float = Field(ge=0)
    content_trust: Literal["untrusted"] = "untrusted"


class TheorySearchData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["evidence_found", "insufficient_evidence"]
    query: str
    pipeline_version: str
    results: list[TheoryStudyEvidence] = Field(default_factory=list, max_length=3)


class McpToolResult[DataT: BaseModel](BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: McpToolStatus
    data: DataT | None = None
    error: McpToolError | None = None

    @model_validator(mode="after")
    def validate_status_payload(self) -> "McpToolResult[DataT]":
        if self.status == "success" and (self.data is None or self.error is not None):
            raise ValueError("Successful MCP results require data and forbid errors.")
        if self.status == "error" and (self.error is None or self.data is not None):
            raise ValueError("Failed MCP results require an error and forbid data.")
        return self


class AnalyzePgnResult(McpToolResult[CompactAnalysis]):
    pass


class AnalyzeLichessPlayerResult(McpToolResult[CompactAnalysis]):
    pass


class SearchChessTheoryResult(McpToolResult[TheorySearchData]):
    pass
