from pydantic import BaseModel, Field


class AgentRequest(BaseModel):
    message: str


class StudyRequest(BaseModel):
    study_id: str


class TheorySearchRequest(BaseModel):
    query: str
    n_results: int = Field(default=3, ge=1, le=10)


class TheorySearchResult(BaseModel):
    text: str
    metadata: dict
    distance: float


class TheorySearchResponse(BaseModel):
    results: list[TheorySearchResult]
