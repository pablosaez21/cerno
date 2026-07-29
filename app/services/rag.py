import sqlite3
from functools import lru_cache
from pathlib import Path
from typing import Any, cast

import chromadb
import httpx
from chromadb.api.models.Collection import Collection
from chromadb.api.types import Documents, EmbeddingFunction
from chromadb.utils import embedding_functions
from overrides import overrides

from app.core.config import settings

LICHESS_STUDY_BASE_URL = "https://lichess.org/study"
LICHESS_TIMEOUT_SECONDS = 15.0


class ChromaStoreError(chromadb.errors.ChromaError):
    """Raised when Cerno cannot initialize its local Chroma store."""

    @classmethod
    @overrides
    def name(cls) -> str:
        return "ChromaStoreError"


def create_chroma_collection(
    path: str | Path,
    *,
    name: str = "chess_theory",
    embedding_function: EmbeddingFunction[Documents] | None = None,
) -> Collection:
    """Create an isolated persistent collection at an explicit path."""
    active_embedding = (
        embedding_function
        if embedding_function is not None
        else embedding_functions.DefaultEmbeddingFunction()
    )

    try:
        client = chromadb.PersistentClient(path=str(path))
        return client.get_or_create_collection(
            name=name,
            # Chroma's concrete default embedding type is narrower than the
            # generic protocol accepted by get_or_create_collection.
            embedding_function=cast(Any, active_embedding),
        )
    except (chromadb.errors.ChromaError, OSError, sqlite3.Error) as exc:
        raise ChromaStoreError(
            f"Could not open ChromaDB collection '{name}' at '{path}'."
        ) from exc


@lru_cache(maxsize=1)
def get_collection() -> Collection:
    """Return the product collection without touching disk during import."""
    return create_chroma_collection(settings.chroma_path)


async def fetch_lichess_study(study_id: str) -> str:
    url = f"{LICHESS_STUDY_BASE_URL}/{study_id}.pgn"
    headers = {"Accept": "application/x-chess-pgn"}

    try:
        async with httpx.AsyncClient(timeout=LICHESS_TIMEOUT_SECONDS) as http:
            response = await http.get(url, headers=headers)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code
        raise ValueError(
            f"No se pudo descargar el estudio de Lichess '{study_id}'. "
            f"Status HTTP: {status_code}."
        ) from exc
    except httpx.HTTPError as exc:
        raise ValueError(
            f"No se pudo conectar con Lichess para descargar el estudio '{study_id}'."
        ) from exc

    if not response.text.strip():
        raise ValueError(f"El estudio de Lichess '{study_id}' no tiene PGN disponible.")

    return response.text


def chunk_study_pgn(
    pgn_text: str, study_id: str, category: str = "uncategorized"
) -> list[dict]:
    source = f"{LICHESS_STUDY_BASE_URL}/{study_id}"
    games = []
    current_game: list[str] = []

    for line in pgn_text.splitlines():
        if line.startswith("[Event ") and current_game:
            games.append("\n".join(current_game).strip())
            current_game = []
        current_game.append(line)

    if current_game:
        games.append("\n".join(current_game).strip())

    chunks = []
    for index, game_text in enumerate(g for g in games if g.strip()):
        chapter = (
            _extract_tag_value(game_text, "ChapterName")
            or _extract_tag_value(game_text, "Chapter")
            or "unknown"
        )
        chunks.append(
            {
                "id": f"{study_id}_{index}",
                "text": game_text,
                "metadata": {
                    "study_id": study_id,
                    "category": category,
                    "chapter": chapter,
                    "source": source,
                    "type": "lichess_study",
                },
            }
        )

    return chunks


def _extract_tag_value(pgn_text: str, tag: str) -> str | None:
    prefix = f'[{tag} "'
    for line in pgn_text.splitlines():
        if line.startswith(prefix) and line.endswith('"]'):
            return line[len(prefix) : -2]
    return None


async def index_study(study_id: str, category: str = "uncategorized") -> int:
    pgn_text = await fetch_lichess_study(study_id)
    chunks = chunk_study_pgn(pgn_text, study_id, category)
    return upsert_chunks(chunks)


def upsert_chunks(
    chunks: list[dict],
    *,
    target_collection: Collection | None = None,
) -> int:
    """Upsert already-prepared chunks into the selected Chroma collection."""
    if not chunks:
        return 0

    active_collection = (
        target_collection if target_collection is not None else get_collection()
    )
    documents = [c["text"] for c in chunks]
    ids = [c["id"] for c in chunks]
    metadatas = [c["metadata"] for c in chunks]

    active_collection.upsert(documents=documents, ids=ids, metadatas=metadatas)

    return len(chunks)


def search_theory(
    query: str,
    n_results: int = 3,
    *,
    target_collection: Collection | None = None,
) -> list[dict]:
    active_collection = (
        target_collection if target_collection is not None else get_collection()
    )
    if active_collection.count() == 0:
        return []

    results = active_collection.query(query_texts=[query], n_results=n_results)

    documents = (results.get("documents") or [[]])[0]
    metadatas = (results.get("metadatas") or [[]])[0]
    distances = (results.get("distances") or [[]])[0]

    return [
        {"text": document, "metadata": metadata or {}, "distance": distance}
        for document, metadata, distance in zip(
            documents,
            metadatas,
            distances,
            strict=False,
        )
    ]
