from __future__ import annotations

import gc
from collections.abc import Generator
from pathlib import Path

import pytest
from chromadb.api.client import SharedSystemClient
from chromadb.api.models.Collection import Collection
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings

from app.schemas.rag import RagManifest, RagSource
from app.services.rag import (
    EMBEDDING_VERSION,
    PIPELINE_VERSION,
    ChromaStoreError,
    create_chroma_collection,
    hash_content,
    reconcile_index,
    reindex_source,
    retrieve_theory,
    search_theory,
    upsert_chunks,
)

pytestmark = [pytest.mark.integration, pytest.mark.chroma]

KEYWORDS = (
    ("opening", "develop", "center", "castle"),
    ("middlegame", "strategy", "plan", "evaluate", "tactic", "outpost", "attack"),
    ("structure", "isolated", "doubled", "backward"),
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
                "phase": "opening",
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
                "category": "middlegame_strategy",
                "phase": "middlegame",
                "chapter": "Forcing moves",
                "source": "fixture://middlegame",
                "type": "test_fixture",
            },
        },
        {
            "id": "fixture-study_2",
            "text": "An isolated pawn structure needs active piece play and planning.",
            "metadata": {
                "study_id": "fixture-study",
                "category": "pawn_structures",
                "phase": "middlegame",
                "chapter": "Isolated pawn",
                "source": "fixture://pawn-structures",
                "type": "test_fixture",
            },
        },
        {
            "id": "fixture-study_3",
            "text": "A rook belongs on an open file and becomes active from the seventh rank.",
            "metadata": {
                "study_id": "fixture-study",
                "category": "rook_endgames",
                "phase": "endgame",
                "chapter": "Active rook",
                "source": "fixture://rook-endgame",
                "type": "test_fixture",
            },
        },
        {
            "id": "fixture-study_4",
            "text": "In a pawn ending, king opposition decides which pawn can promote.",
            "metadata": {
                "study_id": "fixture-study",
                "category": "pawn_endgames",
                "phase": "endgame",
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
                "phase": "unknown",
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
    assert upsert_chunks(corpus(), target_collection=temporary_collection) == 6
    assert temporary_collection.count() == 6

    stored = temporary_collection.get(ids=["fixture-study_3"])
    assert stored["documents"] == [
        "A rook belongs on an open file and becomes active from the seventh rank."
    ]
    assert stored["metadatas"][0]["chapter"] == "Active rook"

    results = search_theory(
        "A rook belongs on an open file and becomes active from the seventh rank.",
        n_results=2,
        target_collection=temporary_collection,
    )
    assert results[0]["metadata"] == {
        "study_id": "fixture-study",
        "category": "rook_endgames",
        "phase": "endgame",
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
    assert upsert_chunks(corpus(), target_collection=collection) == 6

    replacement = [
        {
            "id": "fixture-study_3",
            "text": "Rook activity improves when the rook controls an open file.",
            "metadata": {
                "study_id": "fixture-study",
                "category": "rook_endgames",
                "phase": "endgame",
                "chapter": "Updated rook activity",
                "source": "fixture://rook-endgame",
                "type": "test_fixture",
            },
        }
    ]
    assert upsert_chunks(replacement, target_collection=collection) == 1
    assert collection.count() == 6

    del collection
    gc.collect()
    SharedSystemClient.clear_system_cache()

    reopened = create_chroma_collection(
        path,
        name="integration_theory",
        embedding_function=KeywordEmbeddingFunction(),
    )
    try:
        stored = reopened.get(ids=["fixture-study_3"])
        assert reopened.count() == 6
        assert stored["documents"] == [
            "Rook activity improves when the rook controls an open file."
        ]
        assert stored["metadatas"][0]["chapter"] == "Updated rook activity"
    finally:
        del reopened
        gc.collect()
        SharedSystemClient.clear_system_cache()


def complete_chunk(
    chunk_id: str,
    source_id: str,
    text: str,
    *,
    phase: str = "opening",
) -> dict:
    return {
        "id": chunk_id,
        "text": text,
        "metadata": {
            "source_id": source_id,
            "provider": "lichess-study",
            "study_id": source_id,
            "study_title": "Fixture",
            "chapter_id": f"{source_id}:0",
            "chapter": "Fixture chapter",
            "category": "opening_principles",
            "phase": phase,
            "topic": "development center control",
            "language": "en",
            "source": f"fixture://{source_id}",
            "type": "lichess_study",
            "pipeline_version": PIPELINE_VERSION,
            "embedding_version": EMBEDDING_VERSION,
            "content_hash": hash_content(text),
        },
    }


def fixture_manifest() -> RagManifest:
    return RagManifest(
        manifest_version="1",
        pipeline_version=PIPELINE_VERSION,
        embedding_version=EMBEDDING_VERSION,
        sources=[
            RagSource(
                id="expected",
                provider="lichess-study",
                title="Expected fixture",
                category="opening_principles",
                phase="opening",
                topic="development center control",
                language="en",
            )
        ],
    )


def test_source_reindex_is_idempotent_and_removes_stale_chunks(
    temporary_collection: Collection,
) -> None:
    initial = [
        complete_chunk(
            "expected:old",
            "expected",
            "Opening development controls the center.",
        )
    ]
    first = reindex_source(
        initial,
        "expected",
        target_collection=temporary_collection,
    )
    second = reindex_source(
        initial,
        "expected",
        target_collection=temporary_collection,
    )
    replacement = [
        complete_chunk(
            "expected:new",
            "expected",
            "Opening development controls the center and prepares castling.",
        )
    ]
    third = reindex_source(
        replacement,
        "expected",
        target_collection=temporary_collection,
    )

    assert first.unchanged is False
    assert second.unchanged is True
    assert third.stale_chunks_deleted == 1
    assert temporary_collection.get()["ids"] == ["expected:new"]


def test_source_reindex_removes_legacy_chunks_for_same_study(
    temporary_collection: Collection,
) -> None:
    upsert_chunks(
        [
            {
                "id": "expected_legacy",
                "text": "Legacy whole-chapter opening text.",
                "metadata": {
                    "study_id": "expected",
                    "category": "opening_principles",
                    "chapter": "Legacy",
                    "source": "fixture://expected",
                },
            }
        ],
        target_collection=temporary_collection,
    )
    current = complete_chunk(
        "expected:current",
        "expected",
        "Opening development controls the center.",
    )

    report = reindex_source(
        [current],
        "expected",
        target_collection=temporary_collection,
    )

    assert report.stale_chunks_deleted == 1
    assert temporary_collection.get()["ids"] == ["expected:current"]


def test_reconciliation_detects_and_safely_deletes_orphans(
    temporary_collection: Collection,
) -> None:
    upsert_chunks(
        [
            complete_chunk("expected:0", "expected", "Opening center control."),
            complete_chunk("orphan:0", "orphan", "Obsolete opening content."),
        ],
        target_collection=temporary_collection,
    )

    dry_run = reconcile_index(
        fixture_manifest(),
        target_collection=temporary_collection,
    )
    applied = reconcile_index(
        fixture_manifest(),
        target_collection=temporary_collection,
        apply=True,
    )

    assert dry_run.unexpected_sources == ["orphan"]
    assert dry_run.orphan_chunk_ids == ["orphan:0"]
    assert dry_run.deleted_chunk_ids == []
    assert applied.deleted_chunk_ids == ["orphan:0"]
    assert temporary_collection.get()["ids"] == ["expected:0"]


def test_typed_retrieval_relevant_irrelevant_and_filters(
    temporary_collection: Collection,
) -> None:
    upsert_chunks(corpus(), target_collection=temporary_collection)

    relevant = retrieve_theory(
        "rook file rank",
        phase="endgame",
        max_distance=0.01,
        target_collection=temporary_collection,
    )
    irrelevant = retrieve_theory(
        "postgres database optimizer",
        max_distance=0.01,
        target_collection=temporary_collection,
    )

    assert relevant.status == "evidence_found"
    assert relevant.documents[0].metadata["phase"] == "endgame"
    assert irrelevant.status == "insufficient_evidence"
    assert irrelevant.documents == []


@pytest.mark.parametrize(
    ("query", "phase", "category"),
    [
        (
            "Middlegame tactics begin with forcing moves and an outpost attack.",
            "middlegame",
            "middlegame_strategy",
        ),
        (
            "In a pawn ending, king opposition decides which pawn can promote.",
            "endgame",
            "pawn_endgames",
        ),
        (
            "A rook belongs on an open file and becomes active from the seventh rank.",
            "endgame",
            "rook_endgames",
        ),
    ],
)
def test_retrieves_explicit_middlegame_and_endgame_categories(
    temporary_collection: Collection,
    query: str,
    phase: str,
    category: str,
) -> None:
    upsert_chunks(corpus(), target_collection=temporary_collection)

    result = retrieve_theory(
        query,
        phase=phase,
        category=category,
        max_distance=0.01,
        target_collection=temporary_collection,
    )

    assert result.status == "evidence_found"
    assert result.documents[0].metadata["category"] == category


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
