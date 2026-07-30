from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.services.rag import (
    MAX_CHUNK_CHARACTERS,
    ChromaStoreError,
    chunk_study_pgn,
    create_chroma_collection,
    get_collection,
    hash_content,
    retrieve_theory,
    search_theory,
    upsert_chunks,
)


def test_product_collection_is_created_lazily_and_cached():
    collection = object()
    get_collection.cache_clear()

    with patch(
        "app.services.rag.create_chroma_collection",
        return_value=collection,
    ) as create_collection:
        assert get_collection() is collection
        assert get_collection() is collection

    create_collection.assert_called_once()
    get_collection.cache_clear()


def test_upsert_chunks_uses_explicit_collection():
    collection = MagicMock()
    chunks = [
        {
            "id": "fixture_0",
            "text": "Controlled opening principles.",
            "metadata": {
                "study_id": "fixture",
                "chapter": "Opening",
                "source": "fixture://opening",
            },
        }
    ]

    assert upsert_chunks(chunks, target_collection=collection) == 1
    collection.upsert.assert_called_once_with(
        documents=["Controlled opening principles."],
        ids=["fixture_0"],
        metadatas=[chunks[0]["metadata"]],
    )


def test_empty_upsert_does_not_open_product_collection():
    with patch("app.services.rag.get_collection") as get_product_collection:
        assert upsert_chunks([]) == 0

    get_product_collection.assert_not_called()


def test_search_theory_does_not_query_an_empty_explicit_collection():
    collection = MagicMock()
    collection.count.return_value = 0

    assert search_theory("rook ending", target_collection=collection) == []
    collection.query.assert_not_called()


def test_search_theory_maps_real_collection_shape():
    collection = MagicMock()
    collection.count.return_value = 1
    collection.query.return_value = {
        "documents": [["Rook activity."]],
        "metadatas": [
            [
                {
                    "source": "fixture://rook",
                    "chapter": "Active rook",
                }
            ]
        ],
        "distances": [[0.25]],
    }

    assert search_theory("rook activity", target_collection=collection) == [
        {
            "text": "Rook activity.",
            "metadata": {
                "source": "fixture://rook",
                "chapter": "Active rook",
            },
            "distance": 0.25,
        }
    ]


def test_chunking_is_bounded_reproducible_and_preserves_metadata():
    long_comment = " ".join(["development"] * 500)
    pgn = f"""[Event "Center and development"]
[Site "https://lichess.org/study/fixture/chapter"]

1. e4 {{{long_comment}}} e5 2. Nf3 Nc6 3. Bb5 a6 *
"""

    first = chunk_study_pgn(
        pgn,
        "fixture",
        "opening_principles",
        phase="opening",
        topic="development center control",
        study_title="Opening principles",
    )
    second = chunk_study_pgn(
        pgn,
        "fixture",
        "opening_principles",
        phase="opening",
        topic="development center control",
        study_title="Opening principles",
    )

    assert first == second
    assert len(first) > 1
    assert all(len(chunk["text"]) <= MAX_CHUNK_CHARACTERS for chunk in first)
    for chunk in first:
        metadata = chunk["metadata"]
        assert metadata["source_id"] == "fixture"
        assert metadata["chapter"] == "Center and development"
        assert metadata["category"] == "opening_principles"
        assert metadata["phase"] == "opening"
        assert metadata["pipeline_version"] == "rag-v1"
        assert metadata["embedding_version"].startswith("chroma-default")
        assert metadata["content_hash"] == hash_content(chunk["text"])


def test_content_hash_ignores_incidental_whitespace_but_not_content():
    assert hash_content("Develop pieces.\nControl the center.") == hash_content(
        "Develop pieces. Control the center."
    )
    assert hash_content("Develop pieces.") != hash_content("Trade pieces.")


def test_position_only_pgn_chapter_keeps_teaching_comment():
    chunks = chunk_study_pgn(
        """[Event "Central squares"]
[FEN "8/8/8/8/8/8/8/8 w - - 0 1"]
[SetUp "1"]

{Control e4, e5, d4 and d5. [%csl Ge4,Ge5,Gd4,Gd5]} *
""",
        "fixture",
        "opening_principles",
        phase="opening",
    )

    assert len(chunks) == 1
    assert "Notes: Control e4, e5, d4 and d5." in chunks[0]["text"]
    assert "%csl" not in chunks[0]["text"]


def test_typed_retrieval_abstains_when_phase_filter_has_no_content():
    collection = MagicMock()
    collection.count.return_value = 1
    collection.get.return_value = {"ids": []}

    result = retrieve_theory(
        "rook endgame principles",
        target_collection=collection,
    )

    assert result.status == "insufficient_evidence"
    assert result.documents == []
    collection.get.assert_called_once_with(
        where={"phase": "endgame"},
        include=[],
    )
    collection.query.assert_not_called()


def test_typed_retrieval_abstains_above_calibrated_distance():
    collection = MagicMock()
    collection.count.return_value = 1
    collection.query.return_value = {
        "documents": [["An opening chapter."]],
        "metadatas": [[{"phase": "opening"}]],
        "distances": [[9.0]],
    }

    result = retrieve_theory(
        "unrelated database question",
        max_distance=0.5,
        target_collection=collection,
    )

    assert result.status == "insufficient_evidence"
    assert result.documents == []


def test_chroma_factory_wraps_unavailable_storage():
    with (
        patch(
            "app.services.rag.chromadb.PersistentClient",
            side_effect=OSError("unavailable"),
        ),
        pytest.raises(
            ChromaStoreError,
            match="Could not open ChromaDB collection",
        ),
    ):
        create_chroma_collection(Path("unavailable"))
