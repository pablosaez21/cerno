import chromadb
from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.schemas.agent import (
    AgentRequest,
    AgentResponse,
    StudyRequest,
    TheorySearchRequest,
    TheorySearchResponse,
)
from app.services.agent import (
    AgentIterationLimitError,
    AgentProviderError,
    AgentTimeoutError,
    AgentUnavailableError,
    run_agent,
)
from app.services.rag import index_study, search_theory

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/chat", response_model=AgentResponse)
async def chat(request: AgentRequest) -> AgentResponse:
    if not settings.enable_experimental_agent:
        raise HTTPException(
            status_code=503,
            detail=(
                "The experimental agent is disabled. Set "
                "ENABLE_EXPERIMENTAL_AGENT=true to enable it."
            ),
        )

    try:
        return await run_agent(request.message)
    except AgentUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AgentTimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    except (AgentIterationLimitError, AgentProviderError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/index-study")
async def index_chess_study(request: StudyRequest):
    try:
        total = await index_study(request.study_id, category=request.category)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except chromadb.errors.ChromaError as exc:
        raise HTTPException(
            status_code=500,
            detail="The study could not be indexed in ChromaDB.",
        ) from exc

    return {
        "indexed_chunks": total,
        "study_id": request.study_id,
        "category": request.category,
    }


@router.post("/search-theory", response_model=TheorySearchResponse)
async def search_chess_theory(request: TheorySearchRequest):
    try:
        results = search_theory(request.query, request.n_results)
    except chromadb.errors.ChromaError as exc:
        raise HTTPException(
            status_code=500,
            detail="Theory could not be searched in ChromaDB.",
        ) from exc

    return TheorySearchResponse.model_validate({"results": results})
