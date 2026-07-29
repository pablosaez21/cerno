from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.services.rag import (
    ChromaStoreError,
    create_chroma_collection,
    get_collection,
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
