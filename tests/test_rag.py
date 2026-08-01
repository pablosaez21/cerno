import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.schemas.rag import RagSource
from app.services.rag import (
    MAX_CHUNK_CHARACTERS,
    ChromaStoreError,
    chunk_study_pgn,
    chunk_wikimedia_html,
    create_chroma_collection,
    fetch_source,
    fetch_wikimedia_page,
    get_collection,
    hash_content,
    load_manifest,
    retrieve_theory,
    search_theory,
    upsert_chunks,
)

HISTORICAL_LICHESS_SOURCE_IDS = {
    "ygVnJzbX",
    "NfMygq6x",
    "vyS3PnUA",
    "6XvaoT1n",
    "qVA8CAKj",
    "M17xhXZI",
    "uK53IvBH",
    "allfhhua",
    "Utd758xx",
    "KjivNw7F",
    "efGLGZOM",
    "h4GuSZh3",
    "pgfDEvmk",
    "yzy5Hln3",
    "oBsew7N6",
}

EDUCATIONAL_EXPANSION_BY_CATEGORY = {
    "middlegame_strategy": {"kjBSgqoA", "dYFcDtRq"},
    "pawn_structures": {"B5upGe9A"},
    "king_safety": {"WfPHnXa1"},
    "pawn_endgames": {"EOqdyQeN"},
    "rook_endgames": {"bnboDhFM"},
    "minor_piece_endgames": {"xtDSXkyi"},
}


def wikimedia_source() -> RagSource:
    return RagSource(
        id="wikibooks-pawn-endings",
        provider="wikimedia-page",
        title="Pawn Endings",
        category="pawn_endgames",
        phase="endgame",
        topic="opposition and passed pawns",
        language="en",
        page_title="Chess/The Endgame/Pawn Endings",
        revision_id=4242584,
        source_url="https://example.test/pinned",
        attribution_url="https://example.test/history",
        author="Wikibooks contributors",
        content_license="CC BY-SA 4.0",
        license_url="https://creativecommons.org/licenses/by-sa/4.0/",
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


def test_manifest_preserves_historical_studies_and_expands_educational_coverage():
    manifest = load_manifest()
    sources = {source.id: source for source in manifest.sources}

    assert HISTORICAL_LICHESS_SOURCE_IDS <= sources.keys()
    assert all(source.provider == "lichess-study" for source in sources.values())

    for category, source_ids in EDUCATIONAL_EXPANSION_BY_CATEGORY.items():
        assert source_ids <= sources.keys()
        for source_id in source_ids:
            source = sources[source_id]
            assert source.enabled is True
            assert source.category == category
            assert source.author
            assert source.source_url == f"https://lichess.org/study/{source_id}"
            assert source.attribution_url
            assert source.content_license == "Unspecified"


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


def test_lichess_chunking_filters_chapters_and_preserves_attribution():
    pgn = """[Event "Included lesson"]
[ChapterName "Included lesson"]

1. e4 {Improve the least active piece.} e5 *

[Event "Excluded lesson"]
[ChapterName "Excluded lesson"]

1. d4 {This belongs to a different category.} d5 *
"""

    chunks = chunk_study_pgn(
        pgn,
        "fixture",
        "middlegame_strategy",
        phase="middlegame",
        study_title="Planning course",
        author="Course author",
        attribution_url="https://lichess.org/@/CourseAuthor",
        content_license="Unspecified",
        included_chapters={"Included lesson"},
    )

    assert {chunk["metadata"]["chapter"] for chunk in chunks} == {"Included lesson"}
    assert chunks[0]["metadata"]["author"] == "Course author"
    assert (
        chunks[0]["metadata"]["attribution_url"] == "https://lichess.org/@/CourseAuthor"
    )
    assert chunks[0]["metadata"]["content_license"] == "Unspecified"


def test_wikimedia_chunking_is_bounded_attributed_and_excludes_unsafe_sections():
    source = wikimedia_source()
    html = f"""
<p>Introductory endgame context.</p>
<h2>The Opposition</h2>
<p>{" ".join(["Opposition controls key squares."] * 100)}</p>
<blockquote>Third-party quotation must not be indexed.</blockquote>
<table><tr><td>Diagram furniture must not be indexed.</td></tr></table>
<h2>References</h2>
<p>Bibliography must not be indexed.</p>
"""

    chunks = chunk_wikimedia_html(html, source)

    assert len(chunks) > 1
    assert all(len(chunk["text"]) <= MAX_CHUNK_CHARACTERS for chunk in chunks)
    combined = " ".join(chunk["text"] for chunk in chunks)
    assert "Opposition controls key squares." in combined
    assert "Third-party quotation" not in combined
    assert "Diagram furniture" not in combined
    assert "Bibliography" not in combined
    for chunk in chunks:
        metadata = chunk["metadata"]
        assert metadata["provider"] == "wikimedia-page"
        assert metadata["revision_id"] == 4242584
        assert metadata["content_license"] == "CC BY-SA 4.0"
        assert metadata["attribution_url"] == "https://example.test/history"
        assert metadata["content_hash"] == hash_content(chunk["text"])


def test_wikimedia_fetch_requires_the_pinned_title_and_revision():
    source = wikimedia_source()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["oldid"] == "4242584"
        assert request.headers["User-Agent"].startswith("Cerno-RAG/")
        return httpx.Response(
            200,
            request=request,
            json={
                "parse": {
                    "title": source.page_title,
                    "revid": source.revision_id,
                    "text": "<h2>The Opposition</h2><p>Teaching prose.</p>",
                }
            },
        )

    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(handler)
    with patch(
        "app.services.rag.httpx.AsyncClient",
        side_effect=lambda **kwargs: real_client(transport=transport, **kwargs),
    ):
        html = asyncio.run(fetch_wikimedia_page(source))

    assert html.endswith("<p>Teaching prose.</p>")


def test_wikimedia_fetch_retries_a_rate_limit():
    source = wikimedia_source()
    requests = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal requests
        requests += 1
        if requests == 1:
            return httpx.Response(
                429,
                request=request,
                headers={"Retry-After": "0"},
            )
        return httpx.Response(
            200,
            request=request,
            json={
                "parse": {
                    "title": source.page_title,
                    "revid": source.revision_id,
                    "text": "<p>Recovered.</p>",
                }
            },
        )

    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(handler)
    with (
        patch(
            "app.services.rag.httpx.AsyncClient",
            side_effect=lambda **kwargs: real_client(transport=transport, **kwargs),
        ),
        patch("app.services.rag.asyncio.sleep", new=AsyncMock()) as sleep,
    ):
        assert "Recovered" in asyncio.run(fetch_wikimedia_page(source))

    assert requests == 2
    sleep.assert_awaited_once_with(0.0)


def test_wikimedia_fetch_returns_a_controlled_http_error():
    source = wikimedia_source()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, request=request)

    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(handler)
    with (
        patch(
            "app.services.rag.httpx.AsyncClient",
            side_effect=lambda **kwargs: real_client(transport=transport, **kwargs),
        ),
        pytest.raises(ValueError, match="HTTP 404"),
    ):
        asyncio.run(fetch_wikimedia_page(source))


def test_generic_source_fetch_keeps_the_lichess_adapter():
    source = RagSource(
        id="fixture",
        provider="lichess-study",
        title="Fixture",
        category="opening_principles",
        phase="opening",
        topic="development",
        language="en",
    )
    with patch(
        "app.services.rag.fetch_lichess_study",
        new=AsyncMock(return_value="fixture pgn"),
    ) as fetch:
        assert asyncio.run(fetch_source(source)) == "fixture pgn"

    fetch.assert_awaited_once_with("fixture")


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
