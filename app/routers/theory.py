from fastapi import APIRouter, HTTPException
import chromadb

from app.schemas.agent import TheorySearchRequest, TheorySearchResponse
from app.services.rag import search_theory

router = APIRouter(prefix="/theory", tags=["theory"])


@router.post("/search", response_model=TheorySearchResponse)
async def search_theory_endpoint(request: TheorySearchRequest):
    try:
        results = search_theory(request.query, request.n_results)
    except chromadb.errors.ChromaError as exc:
        raise HTTPException(
            status_code=500,
            detail="No se pudo buscar teoria en ChromaDB."
        ) from exc

    return TheorySearchResponse(results=results)
