from fastapi import APIRouter, HTTPException
import chromadb
from app.services.agent import run_agent
from app.services.rag import index_study, search_theory
from app.schemas.agent import (
    AgentRequest,
    StudyRequest,
    TheorySearchRequest,
    TheorySearchResponse,
)

router = APIRouter(prefix="/agent", tags=["agent"])

@router.post("/chat")
async def chat(request: AgentRequest):
    response = await run_agent(request.message)
    return {"response": response}


@router.post("/index-study")
async def index_chess_study(request: StudyRequest):
    try:
        total = await index_study(request.study_id)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except chromadb.errors.ChromaError as exc:
        raise HTTPException(
            status_code=500,
            detail="No se pudo indexar el estudio en ChromaDB."
        ) from exc

    return {"indexed_chunks": total, "study_id": request.study_id}


@router.post("/search-theory", response_model=TheorySearchResponse)
async def search_chess_theory(request: TheorySearchRequest):
    try:
        results = search_theory(request.query, request.n_results)
    except chromadb.errors.ChromaError as exc:
        raise HTTPException(
            status_code=500,
            detail="No se pudo buscar teoría en ChromaDB."
        ) from exc

    return TheorySearchResponse(results=results)
