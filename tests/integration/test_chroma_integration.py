from __future__ import annotations

import gc
from collections.abc import Generator
from pathlib import Path

import pytest
from chromadb.api.client import SharedSystemClient
from chromadb.api.models.Collection import Collection
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings

from app.services.rag import (
    ChromaStoreError,
    create_chroma_collection,
    search_theory,
    upsert_chunks,
)

pytestmark = [pytest.mark.integration, pytest.mark.chroma]

KEYWORDS = (
    ("opening", "develop", "center", "castle"),
    ("middlegame", "tactic", "outpost", "attack"),
    ("rook", "file", "rank"),
    ("pawn", "opposition", "king"),
    ("cooking", "kitchen", "recipe"),
)


class KeywordEmbeddingFunction(EmbeddingFunction[Documents]):
    """Small deterministic embedding used only for technical integration tests."""

    def __init__(self) -> None:
        pass

    def __call__(self, input: Documents) -> Embeddings:
        embeddings: Embeddings = []
        for document in input:
            normalized = document.casefold()
            embeddings.append(
                [
                    float(sum(normalized.count(keyword) for keyword in vocabulary))
                    for vocabulary in KEYWORDS
                ]
            )
        return embeddings

    @staticmethod
    def name() -> str:
        return "cerno-test-keyword-embedding"

    @staticmethod
    def build_from_config(
        config: dict[str, object],
    ) -> KeywordEmbeddingFunction:
        return KeywordEmbeddingFunction()

    def get_config(self) -> dict[str, object]:
        return {}


def corpus() -> list[dict]:
    return [
        {
            "id": "fixture-study_0",
            "text": "Opening development controls the center and prepares to castle.",
            "metadata": {
                "study_id": "fixture-study",
                "category": "opening",
                "chapter": "Opening principles",
                "source": "fixture://opening",
                "type": "test_fixture",
            },
        },
        {
            "id": "fixture-study_1",
            "text": "Middlegame tactics begin with forcing moves and an outpost attack.",
            "metadata": {
                "study_id": "fixture-study",
                "category": "middlegame",
                "chapter": "Forcing moves",
                "source": "fixture://middlegame",
                "type": "test_fixture",
            },
        },
        {
            "id": "fixture-study_2",
            "text": "A rook belongs on an open file and becomes active from the seventh rank.",
            "metadata": {
                "study_id": "fixture-study",
                "category": "rook_endgame",
                "chapter": "Active rook",
                "source": "fixture://rook-endgame",
                "type": "test_fixture",
            },
        },
        {
            "id": "fixture-study_3",
            "text": "In a pawn ending, king opposition decides which pawn can promote.",
            "metadata": {
                "study_id": "fixture-study",
                "category": "pawn_endgame",
                "chapter": "King opposition",
                "source": "fixture://pawn-endgame",
                "type": "test_fixture",
            },
        },
        {
            "id": "irrelevant_0",
            "text": "A cooking recipe belongs in the kitchen and is unrelated to chess.",
            "metadata": {
                "study_id": "irrelevant",
                "category": "irrelevant",
                "chapter": "Cooking",
                "source": "fixture://irrelevant",
                "type": "test_fixture",
            },
        },
    ]


@pytest.fixture
def temporary_collection(tmp_path: Path) -> Generator[Collection]:
    collection = create_chroma_collection(
        tmp_path / "chroma",
        name="integration_theory",
        embedding_function=KeywordEmbeddingFunction(),
    )
    try:
        yield collection
    finally:
        del collection
        gc.collect()
        SharedSystemClient.clear_system_cache()


def test_temporary_collection_starts_empty(
    temporary_collection: Collection,
) -> None:
    assert temporary_collection.count() == 0
    assert (
        search_theory(
            "rook endgame",
            target_collection=temporary_collection,
        )
        == []
    )


def test_real_upsert_persists_metadata_and_retrieves_unambiguous_result(
    temporary_collection: Collection,
) -> None:
    assert upsert_chunks(corpus(), target_collection=temporary_collection) == 5
    assert temporary_collection.count() == 5

    stored = temporary_collection.get(ids=["fixture-study_2"])
    assert stored["documents"] == [
        "A rook belongs on an open file and becomes active from the seventh rank."
    ]
    assert stored["metadatas"][0]["chapter"] == "Active rook"

    results = search_theory(
        "activate the rook on an open file",
        n_results=2,
        target_collection=temporary_collection,
    )
    assert results[0]["metadata"] == {
        "study_id": "fixture-study",
        "category": "rook_endgame",
        "chapter": "Active rook",
        "source": "fixture://rook-endgame",
        "type": "test_fixture",
    }
    assert results[0]["text"].startswith("A rook belongs")
    assert isinstance(results[0]["distance"], float)
    assert results[0]["distance"] >= 0


def test_reindexing_same_ids_is_idempotent_and_persists_on_disk(
    tmp_path: Path,
) -> None:
    path = tmp_path / "persistent-chroma"
    collection = create_chroma_collection(
        path,
        name="integration_theory",
        embedding_function=KeywordEmbeddingFunction(),
    )
    assert upsert_chunks(corpus(), target_collection=collection) == 5

    replacement = [
        {
            "id": "fixture-study_2",
            "text": "Rook activity improves when the rook controls an open file.",
            "metadata": {
                "study_id": "fixture-study",
                "category": "rook_endgame",
                "chapter": "Updated rook activity",
                "source": "fixture://rook-endgame",
                "type": "test_fixture",
            },
        }
    ]
    assert upsert_chunks(replacement, target_collection=collection) == 1
    assert collection.count() == 5

    del collection
    gc.collect()
    SharedSystemClient.clear_system_cache()

    reopened = create_chroma_collection(
        path,
        name="integration_theory",
        embedding_function=KeywordEmbeddingFunction(),
    )
    try:
        stored = reopened.get(ids=["fixture-study_2"])
        assert reopened.count() == 5
        assert stored["documents"] == [
            "Rook activity improves when the rook controls an open file."
        ]
        assert stored["metadatas"][0]["chapter"] == "Updated rook activity"
    finally:
        del reopened
        gc.collect()
        SharedSystemClient.clear_system_cache()


def test_unavailable_chroma_directory_returns_controlled_error(
    tmp_path: Path,
) -> None:
    unavailable_path = tmp_path / "not-a-directory"
    unavailable_path.write_text("blocked", encoding="utf-8")

    with pytest.raises(ChromaStoreError, match="Could not open ChromaDB collection"):
        create_chroma_collection(
            unavailable_path,
            name="integration_theory",
            embedding_function=KeywordEmbeddingFunction(),
        )
