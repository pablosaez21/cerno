from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

AgentToolName = Literal["fetch_games", "analyze_game", "search_theory"]
AgentToolStatus = Literal["success", "error"]
AgentToolErrorCode = Literal[
    "invalid_arguments",
    "unknown_tool",
    "tool_failure",
]


class AgentRequest(BaseModel):
    message: str = Field(min_length=1)


class AgentResponse(BaseModel):
    response: str = Field(min_length=1)


class FetchGamesArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1)
    limit: int = Field(default=3, ge=1, le=3)


class AnalyzeGameArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pgn: str = Field(min_length=1)
    depth: int = Field(default=10, ge=1, le=10)


class SearchTheoryArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=1)
    n_results: int = Field(default=3, ge=1, le=3)


class FetchedGame(BaseModel):
    id: str
    white: str
    black: str
    result: str
    pgn: str


class FetchGamesToolResult(BaseModel):
    games: list[FetchedGame]


class AgentPhaseSummary(BaseModel):
    avg_cpl: float
    inaccuracies: int
    mistakes: int
    blunders: int


class AgentCriticalMoment(BaseModel):
    move_number: int
    move: str
    mover_color: Literal["white", "black"]
    phase: str
    cpl: int
    classification: str


class AnalyzeGameToolResult(BaseModel):
    total_moves: int
    summary: dict[str, AgentPhaseSummary]
    critical_moments: list[AgentCriticalMoment]
    phase_weaknesses: list[str]


class TheorySearchResult(BaseModel):
    text: str
    metadata: dict[str, Any]
    distance: float


class SearchTheoryToolResult(BaseModel):
    results: list[TheorySearchResult]


class AgentToolError(BaseModel):
    code: AgentToolErrorCode
    message: str
    details: list[str] = Field(default_factory=list)


class AgentToolResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tool: str
    status: AgentToolStatus
    data: (
        FetchGamesToolResult | AnalyzeGameToolResult | SearchTheoryToolResult | None
    ) = None
    error: AgentToolError | None = None

    @model_validator(mode="after")
    def validate_status_payload(self) -> "AgentToolResult":
        if self.status == "success" and (self.data is None or self.error is not None):
            raise ValueError("Successful tool results require data and forbid errors.")
        if self.status == "error" and (self.error is None or self.data is not None):
            raise ValueError("Failed tool results require an error and forbid data.")
        return self


class StudyRequest(BaseModel):
    study_id: str
    category: str = Field(default="uncategorized", min_length=1, max_length=80)


class TheorySearchRequest(BaseModel):
    query: str
    n_results: int = Field(default=3, ge=1, le=10)


class TheorySearchResponse(BaseModel):
    results: list[TheorySearchResult]
