from __future__ import annotations

import asyncio
import hashlib
import io
import json
import re
import sqlite3
import unicodedata
from functools import lru_cache
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, ClassVar, cast

import chess.pgn
import chromadb
import httpx
from chromadb.api.models.Collection import Collection
from chromadb.api.types import Documents, EmbeddingFunction
from chromadb.utils import embedding_functions
from overrides import overrides

from app.core.config import settings
from app.schemas.rag import (
    RagManifest,
    RagPhase,
    RagSource,
    ReconciliationReport,
    SourceIndexReport,
    TheoryEvidence,
    TheoryRetrievalResult,
)

LICHESS_STUDY_BASE_URL = "https://lichess.org/study"
LICHESS_TIMEOUT_SECONDS = 15.0
WIKIMEDIA_API_URL = "https://en.wikibooks.org/w/api.php"
WIKIMEDIA_TIMEOUT_SECONDS = 30.0
WIKIMEDIA_USER_AGENT = (
    "Cerno-RAG/1.0 (educational chess corpus; https://github.com/pablo-reyes8/Cerno)"
)
PIPELINE_VERSION = "rag-v1"
EMBEDDING_VERSION = "chroma-default-all-MiniLM-L6-v2"
MAX_CHUNK_CHARACTERS = 1800
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST_PATH = PROJECT_ROOT / "data-manifest" / "chess-theory-sources.json"
DEFAULT_POLICY_PATH = PROJECT_ROOT / "data-manifest" / "retrieval-policy.json"
REQUIRED_CHUNK_METADATA = {
    "source_id",
    "provider",
    "study_id",
    "study_title",
    "chapter_id",
    "chapter",
    "category",
    "phase",
    "topic",
    "language",
    "source",
    "type",
    "pipeline_version",
    "embedding_version",
    "content_hash",
}
WIKIMEDIA_REQUIRED_CHUNK_METADATA = {
    "author",
    "content_license",
    "license_url",
    "attribution_url",
    "page_title",
    "revision_id",
}
EXCLUDED_WIKIMEDIA_SECTIONS = {
    "references",
    "notes",
    "external links",
    "further reading",
    "see also",
    "using this wikibook",
}

PHASE_TERMS = {
    "endgame": (
        "endgame",
        "ending",
        "pawn ending",
        "rook ending",
        "king and pawn",
        "rook and pawn",
        "rook and one pawn",
        "rook and two pawns",
        "passed pawn",
        "outside passed pawn",
        "protected passed pawn",
        "rule of the square",
        "bishop and knight",
        "two bishops",
        "tablebase",
        "opposition",
        "rook versus rook",
        "rook vs. rook",
    ),
    "middlegame": (
        "middlegame",
        "middle game",
        "positional plan",
        "strategic plan",
        "pawn structure",
        "pawn structures",
        "doubled pawn",
        "isolated pawn",
        "isolani",
        "hanging pawn",
        "backward pawn",
        "king safety",
        "king in the center",
        "castled king",
        "open files near the king",
        "pawn shield",
        "pawn storm",
        "minority attack",
        "piece coordination",
    ),
    "opening": (
        "opening",
        "start of a game",
        "start of the game",
        "first moves",
        "develop my pieces",
        "london system",
        "ruy lopez",
        "king's indian",
        "kings indian",
        "english opening",
        "reti",
    ),
}


class WikimediaContentParser(HTMLParser):
    """Extract licensed teaching prose while excluding page furniture and citations."""

    _ignored_tags: ClassVar[set[str]] = {
        "blockquote",
        "figure",
        "math",
        "nav",
        "script",
        "style",
        "sup",
        "table",
    }
    _heading_tags: ClassVar[set[str]] = {"h2", "h3", "h4"}
    _content_tags: ClassVar[set[str]] = {"p", "li"}

    def __init__(self, excluded_sections: set[str]) -> None:
        super().__init__(convert_charrefs=True)
        self.excluded_sections = {
            normalize_for_matching(section) for section in excluded_sections
        }
        self.section = "Introduction"
        self.blocks: list[tuple[str, str]] = []
        self._ignored_depth = 0
        self._capture_tag: str | None = None
        self._capture_parts: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        del attrs
        if self._ignored_depth:
            if tag in self._ignored_tags:
                self._ignored_depth += 1
            return
        if tag in self._ignored_tags:
            self._ignored_depth = 1
            return
        if tag in self._heading_tags | self._content_tags:
            self._capture_tag = tag
            self._capture_parts = []

    def handle_endtag(self, tag: str) -> None:
        if self._ignored_depth:
            if tag in self._ignored_tags:
                self._ignored_depth -= 1
            return
        if tag != self._capture_tag:
            return
        text = normalize_text("".join(self._capture_parts))
        if tag in self._heading_tags:
            if text:
                self.section = text
        elif (
            text and normalize_for_matching(self.section) not in self.excluded_sections
        ):
            self.blocks.append((self.section, text))
        self._capture_tag = None
        self._capture_parts = []

    def handle_data(self, data: str) -> None:
        if not self._ignored_depth and self._capture_tag is not None:
            self._capture_parts.append(data)


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


@lru_cache(maxsize=4)
def load_manifest(path: Path = DEFAULT_MANIFEST_PATH) -> RagManifest:
    payload = json.loads(path.read_text(encoding="utf-8"))
    manifest = RagManifest.model_validate(payload)
    source_ids = [source.id for source in manifest.sources]
    if len(source_ids) != len(set(source_ids)):
        raise ValueError(f"RAG manifest contains duplicate source IDs: {path}.")
    if manifest.pipeline_version != PIPELINE_VERSION:
        raise ValueError("RAG manifest pipeline version does not match the code.")
    if manifest.embedding_version != EMBEDDING_VERSION:
        raise ValueError("RAG manifest embedding version does not match the code.")
    return manifest


@lru_cache(maxsize=4)
def load_relevance_threshold(path: Path = DEFAULT_POLICY_PATH) -> float:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("pipeline_version") != PIPELINE_VERSION:
        raise ValueError("Retrieval policy pipeline version does not match the code.")
    if payload.get("embedding_version") != EMBEDDING_VERSION:
        raise ValueError("Retrieval policy embedding version does not match the code.")
    threshold = payload.get("max_distance")
    if not isinstance(threshold, int | float) or threshold <= 0:
        raise ValueError("Retrieval policy max_distance must be positive.")
    return float(threshold)


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
            f"Could not download Lichess study '{study_id}' (HTTP {status_code})."
        ) from exc
    except httpx.HTTPError as exc:
        raise ValueError(
            f"Could not connect to Lichess to download study '{study_id}'."
        ) from exc

    if not response.text.strip():
        raise ValueError(f"Lichess study '{study_id}' has no available PGN.")
    return response.text


async def fetch_wikimedia_page(source: RagSource) -> str:
    """Download a pinned Wikibooks revision through the official API."""
    if source.provider != "wikimedia-page" or source.revision_id is None:
        raise ValueError("A pinned Wikimedia source is required.")

    params = {
        "action": "parse",
        "oldid": str(source.revision_id),
        "prop": "text|revid",
        "disableeditsection": "1",
        "format": "json",
        "formatversion": "2",
        "maxlag": "5",
    }
    headers = {
        "Accept": "application/json",
        "User-Agent": WIKIMEDIA_USER_AGENT,
    }
    last_error: httpx.HTTPError | None = None

    async with httpx.AsyncClient(timeout=WIKIMEDIA_TIMEOUT_SECONDS) as http:
        for attempt in range(3):
            try:
                response = await http.get(
                    WIKIMEDIA_API_URL,
                    params=params,
                    headers=headers,
                )
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                last_error = exc
                if exc.response.status_code not in {429, 503} or attempt == 2:
                    break
                retry_after = exc.response.headers.get("Retry-After", "1")
                try:
                    retry_seconds = float(retry_after)
                except ValueError:
                    retry_seconds = 1.0
                await asyncio.sleep(min(retry_seconds, 5.0))
                continue
            except httpx.HTTPError as exc:
                last_error = exc
                break

            payload = response.json()
            parsed = payload.get("parse") or {}
            if (
                parsed.get("revid") != source.revision_id
                or parsed.get("title") != source.page_title
            ):
                raise ValueError(
                    f"Wikimedia returned an unexpected revision for '{source.id}'."
                )
            html = parsed.get("text")
            if not isinstance(html, str) or not html.strip():
                raise ValueError(
                    f"Wikimedia source '{source.id}' has no available content."
                )
            return html

    if isinstance(last_error, httpx.HTTPStatusError):
        status_code = last_error.response.status_code
        raise ValueError(
            f"Could not download Wikimedia source '{source.id}' (HTTP {status_code})."
        ) from last_error
    raise ValueError(
        f"Could not connect to Wikimedia to download source '{source.id}'."
    ) from last_error


async def fetch_source(source: RagSource) -> str:
    if source.provider == "lichess-study":
        return await fetch_lichess_study(source.id)
    return await fetch_wikimedia_page(source)


def chunk_study_pgn(
    pgn_text: str,
    study_id: str,
    category: str = "uncategorized",
    *,
    phase: str | None = None,
    topic: str | None = None,
    language: str = "en",
    provider: str = "lichess-study",
    study_title: str | None = None,
) -> list[dict]:
    """Parse a study PGN and create bounded, reproducible teaching chunks."""
    active_phase = phase or phase_for_category(category)
    active_topic = topic or category.replace("_", " ")
    active_title = study_title or study_id
    source_url = f"{LICHESS_STUDY_BASE_URL}/{study_id}"
    stream = io.StringIO(pgn_text)
    chunks: list[dict] = []
    chapter_index = 0

    while True:
        game = chess.pgn.read_game(stream)
        if game is None:
            break
        if game.errors:
            raise ValueError(
                f"Invalid PGN chapter in study '{study_id}': {game.errors[0]}."
            )

        chapter = (
            first_known_header(
                game.headers.get("ChapterName"),
                game.headers.get("Chapter"),
                game.headers.get("Event"),
            )
            or f"Chapter {chapter_index + 1}"
        )
        chapter_id = f"{study_id}:{chapter_index}"
        context = (
            f"{active_title}. {chapter}. "
            f"Category: {category.replace('_', ' ')}. "
            f"Phase: {active_phase}. Topic: {active_topic}."
        )
        nodes = list(game.mainline())
        root_comment = normalize_pgn_comment(game.comment)
        if nodes:
            move_units = []
            if root_comment:
                move_units.extend(
                    split_bounded(
                        f"Context: {root_comment}",
                        MAX_CHUNK_CHARACTERS // 2,
                    )
                )
            move_units.extend(serialize_mainline(game))
            text_chunks = pack_units(
                context,
                move_units,
                MAX_CHUNK_CHARACTERS,
                label="Moves",
            )
        elif root_comment:
            text_chunks = pack_units(
                context,
                split_bounded(root_comment, MAX_CHUNK_CHARACTERS // 2),
                MAX_CHUNK_CHARACTERS,
                label="Notes",
            )
        else:
            chapter_index += 1
            continue

        for chunk_index, text in enumerate(text_chunks):
            content_hash = hash_content(text)
            chunk_id = f"{study_id}:{chapter_index}:{chunk_index}:{content_hash[:12]}"
            chunks.append(
                {
                    "id": chunk_id,
                    "text": text,
                    "metadata": {
                        "source_id": study_id,
                        "provider": provider,
                        "study_id": study_id,
                        "study_title": active_title,
                        "chapter_id": chapter_id,
                        "chapter": chapter,
                        "category": category,
                        "phase": active_phase,
                        "topic": active_topic,
                        "language": language,
                        "source": source_url,
                        "type": "lichess_study",
                        "pipeline_version": PIPELINE_VERSION,
                        "embedding_version": EMBEDDING_VERSION,
                        "content_hash": content_hash,
                    },
                }
            )
        chapter_index += 1

    if not chunks:
        raise ValueError(f"Study '{study_id}' contains no PGN chapters.")
    return chunks


def chunk_wikimedia_html(html: str, source: RagSource) -> list[dict]:
    """Create bounded prose chunks with complete provenance and attribution."""
    if source.provider != "wikimedia-page" or source.revision_id is None:
        raise ValueError("A pinned Wikimedia source is required.")
    if not source.source_url:
        raise ValueError("Wikimedia source URL is required.")

    excluded_sections = EXCLUDED_WIKIMEDIA_SECTIONS | set(source.excluded_sections)
    parser = WikimediaContentParser(excluded_sections)
    parser.feed(html)
    parser.close()

    grouped: dict[str, list[str]] = {}
    for section, text in parser.blocks:
        grouped.setdefault(section, []).append(text)
    chunks = []
    for chapter_index, (section, blocks) in enumerate(grouped.items()):
        context = (
            f"{source.title}. {section}. "
            f"Category: {source.category.replace('_', ' ')}. "
            f"Phase: {source.phase}. Topic: {source.topic}."
        )
        units = [
            part
            for block in blocks
            for part in split_bounded(block, MAX_CHUNK_CHARACTERS // 2)
        ]
        text_chunks = pack_units(
            context,
            units,
            MAX_CHUNK_CHARACTERS,
            label="Content",
        )
        chapter_id = f"{source.id}:{chapter_index}"
        for chunk_index, text in enumerate(text_chunks):
            content_hash = hash_content(text)
            chunk_id = f"{source.id}:{chapter_index}:{chunk_index}:{content_hash[:12]}"
            chunks.append(
                {
                    "id": chunk_id,
                    "text": text,
                    "metadata": {
                        "source_id": source.id,
                        "provider": source.provider,
                        "study_id": source.id,
                        "study_title": source.title,
                        "chapter_id": chapter_id,
                        "chapter": section,
                        "category": source.category,
                        "phase": source.phase,
                        "topic": source.topic,
                        "language": source.language,
                        "source": source.source_url,
                        "type": "wikimedia_page",
                        "pipeline_version": PIPELINE_VERSION,
                        "embedding_version": EMBEDDING_VERSION,
                        "content_hash": content_hash,
                        "revision_id": source.revision_id,
                        "page_title": source.page_title or "",
                        "author": source.author or "",
                        "content_license": source.content_license or "",
                        "license_url": source.license_url or "",
                        "attribution_url": source.attribution_url or "",
                    },
                }
            )

    if not chunks:
        raise ValueError(f"Wikimedia source '{source.id}' contains no teaching prose.")
    return chunks


def serialize_mainline(game: chess.pgn.Game) -> list[str]:
    board = game.board()
    units = []
    for node in game.mainline():
        move_number = board.fullmove_number
        prefix = f"{move_number}." if board.turn else f"{move_number}..."
        san = board.san(node.move)
        comment = normalize_pgn_comment(node.comment)
        unit = f"{prefix} {san}"
        if comment:
            unit = f"{unit} -- {comment}"
        units.extend(split_bounded(unit, MAX_CHUNK_CHARACTERS // 2))
        board.push(node.move)
    return units


def pack_units(
    context: str,
    units: list[str],
    limit: int,
    *,
    label: str = "Moves",
) -> list[str]:
    prefix = f"{context}\n{label}: "
    available = limit - len(prefix)
    if available < 200:
        raise ValueError("RAG chunk context leaves insufficient room for moves.")

    packed = []
    current: list[str] = []
    current_length = 0
    for unit in units:
        separator = 1 if current else 0
        if current and current_length + separator + len(unit) > available:
            packed.append(f"{prefix}{' '.join(current)}")
            current = []
            current_length = 0
        current.append(unit)
        current_length += separator + len(unit)
    if current:
        packed.append(f"{prefix}{' '.join(current)}")
    return packed


def split_bounded(text: str, limit: int) -> list[str]:
    words = text.split()
    if not words:
        return []
    parts = []
    current = words[0]
    for word in words[1:]:
        if len(current) + len(word) + 1 > limit:
            parts.append(current)
            current = word
        else:
            current = f"{current} {word}"
    parts.append(current)
    return parts


def normalize_text(value: str) -> str:
    return " ".join(value.split())


def normalize_pgn_comment(value: str) -> str:
    without_graphics = re.sub(r"\[%[^\]]+\]", " ", value)
    return normalize_text(without_graphics)


def hash_content(text: str) -> str:
    canonical = normalize_text(text)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def first_known_header(*values: str | None) -> str | None:
    for value in values:
        if value and value.strip() not in {"", "?"}:
            return value.strip()
    return None


def phase_for_category(category: str) -> RagPhase:
    if "endgame" in category:
        return "endgame"
    if category in {"middlegame", "tactics", "pawn_structures", "king_safety"}:
        return "middlegame"
    if "opening" in category:
        return "opening"
    return "unknown"


async def index_study(study_id: str, category: str = "uncategorized") -> int:
    """Keep the existing administrative contract while reconciling one source."""
    manifest = load_manifest()
    source = next(
        (item for item in manifest.sources if item.id == study_id),
        None,
    )
    if source is None:
        source = RagSource(
            id=study_id,
            provider="lichess-study",
            title=study_id,
            category=category,
            phase=phase_for_category(category),
            topic=category.replace("_", " "),
            language="en",
        )
    pgn_text = await fetch_lichess_study(study_id)
    chunks = chunks_for_source(pgn_text, source)
    report = reindex_source(chunks, source.id)
    return report.indexed_chunks


def chunks_for_source(source_text: str, source: RagSource) -> list[dict]:
    if source.provider == "wikimedia-page":
        return chunk_wikimedia_html(source_text, source)
    return chunk_study_pgn(
        source_text,
        source.id,
        source.category,
        phase=source.phase,
        topic=source.topic,
        language=source.language,
        provider=source.provider,
        study_title=source.title,
    )


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
    active_collection.upsert(
        documents=[chunk["text"] for chunk in chunks],
        ids=[chunk["id"] for chunk in chunks],
        metadatas=[chunk["metadata"] for chunk in chunks],
    )
    return len(chunks)


def reindex_source(
    chunks: list[dict],
    source_id: str,
    *,
    target_collection: Collection | None = None,
) -> SourceIndexReport:
    if not chunks:
        raise ValueError(f"Refusing to replace source '{source_id}' with no chunks.")
    if any(chunk["metadata"].get("source_id") != source_id for chunk in chunks):
        raise ValueError("Every chunk must belong to the source being reindexed.")
    validate_chunk_metadata(chunks)

    active_collection = (
        target_collection if target_collection is not None else get_collection()
    )
    # `study_id` exists in both the legacy index and rag-v1, so a normal rebuild
    # also removes pre-manifest IDs instead of leaving duplicate old chunks.
    existing = active_collection.get(where={"study_id": source_id})
    existing_ids = set(existing.get("ids") or [])
    new_ids = {chunk["id"] for chunk in chunks}
    unchanged = existing_ids == new_ids and len(existing_ids) == len(chunks)

    upsert_chunks(chunks, target_collection=active_collection)
    stale_ids = sorted(existing_ids - new_ids)
    if stale_ids:
        active_collection.delete(ids=stale_ids)

    return SourceIndexReport(
        source_id=source_id,
        indexed_chunks=len(chunks),
        stale_chunks_deleted=len(stale_ids),
        unchanged=unchanged,
    )


def validate_chunk_metadata(chunks: list[dict]) -> None:
    for chunk in chunks:
        metadata = chunk.get("metadata") or {}
        required_fields = set(REQUIRED_CHUNK_METADATA)
        if metadata.get("provider") == "wikimedia-page":
            required_fields.update(WIKIMEDIA_REQUIRED_CHUNK_METADATA)
        missing = sorted(field for field in required_fields if not metadata.get(field))
        if missing:
            raise ValueError(
                f"Chunk '{chunk.get('id')}' is missing metadata: {', '.join(missing)}."
            )
        if metadata["content_hash"] != hash_content(chunk.get("text", "")):
            raise ValueError(f"Chunk '{chunk.get('id')}' has an invalid content_hash.")


def reconcile_index(
    manifest: RagManifest | None = None,
    *,
    target_collection: Collection | None = None,
    apply: bool = False,
) -> ReconciliationReport:
    active_manifest = manifest or load_manifest()
    expected_sources = {
        source.id for source in active_manifest.sources if source.enabled
    }
    active_collection = (
        target_collection if target_collection is not None else get_collection()
    )
    stored = active_collection.get(include=["metadatas"])
    ids = stored.get("ids") or []
    metadatas = stored.get("metadatas") or []

    indexed_sources = set()
    unexpected_sources = set()
    orphan_ids = []
    incomplete_ids = []
    version_mismatch_ids = []
    hashes: dict[str, list[str]] = {}
    deletable_ids = []

    for chunk_id, raw_metadata in zip(ids, metadatas, strict=False):
        metadata = raw_metadata or {}
        source_id = str(metadata.get("source_id") or metadata.get("study_id") or "")
        if source_id:
            indexed_sources.add(source_id)
        if not source_id or source_id not in expected_sources:
            orphan_ids.append(chunk_id)
            deletable_ids.append(chunk_id)
            if source_id:
                unexpected_sources.add(source_id)

        required_fields = set(REQUIRED_CHUNK_METADATA)
        if metadata.get("provider") == "wikimedia-page":
            required_fields.update(WIKIMEDIA_REQUIRED_CHUNK_METADATA)
        if any(not metadata.get(field) for field in required_fields):
            incomplete_ids.append(chunk_id)
        if (
            metadata.get("pipeline_version") != active_manifest.pipeline_version
            or metadata.get("embedding_version") != active_manifest.embedding_version
        ):
            version_mismatch_ids.append(chunk_id)

        content_hash = metadata.get("content_hash")
        if content_hash:
            hashes.setdefault(str(content_hash), []).append(chunk_id)

    duplicate_hashes = {
        content_hash: chunk_ids
        for content_hash, chunk_ids in hashes.items()
        if len(chunk_ids) > 1
    }
    deleted_ids = sorted(set(deletable_ids)) if apply else []
    if deleted_ids:
        active_collection.delete(ids=deleted_ids)

    return ReconciliationReport(
        manifest_sources=sorted(expected_sources),
        indexed_sources=sorted(indexed_sources),
        missing_sources=sorted(expected_sources - indexed_sources),
        unexpected_sources=sorted(unexpected_sources),
        orphan_chunk_ids=sorted(orphan_ids),
        incomplete_chunk_ids=sorted(incomplete_ids),
        duplicate_content_hashes=duplicate_hashes,
        version_mismatch_chunk_ids=sorted(version_mismatch_ids),
        deleted_chunk_ids=deleted_ids,
    )


def retrieve_theory(
    query: str,
    n_results: int = 3,
    *,
    phase: str | None = None,
    category: str | None = None,
    max_distance: float | None = None,
    target_collection: Collection | None = None,
) -> TheoryRetrievalResult:
    active_collection = (
        target_collection if target_collection is not None else get_collection()
    )
    normalized_query = query.strip()
    if not normalized_query or active_collection.count() == 0:
        return insufficient_evidence(normalized_query)

    active_phase = phase or infer_phase(normalized_query)
    where = build_metadata_filter(active_phase, category)
    matching_count = collection_count(active_collection, where)
    if matching_count == 0:
        return insufficient_evidence(normalized_query)

    candidate_count = min(n_results, matching_count)
    query_args: dict[str, Any] = {
        "query_texts": [normalized_query],
        "n_results": candidate_count,
    }
    if where is not None:
        query_args["where"] = where
    payload = active_collection.query(**query_args)
    threshold = max_distance if max_distance is not None else load_relevance_threshold()
    candidates = map_query_results(payload)
    accepted = [
        candidate for candidate in candidates if candidate.distance <= threshold
    ][:n_results]
    if not accepted:
        return insufficient_evidence(normalized_query)
    return TheoryRetrievalResult(
        status="evidence_found",
        query=normalized_query,
        pipeline_version=PIPELINE_VERSION,
        documents=accepted,
    )


def search_theory(
    query: str,
    n_results: int = 3,
    *,
    phase: str | None = None,
    category: str | None = None,
    target_collection: Collection | None = None,
) -> list[dict]:
    """Compatibility adapter for existing REST, coach, and agent consumers."""
    result = retrieve_theory(
        query,
        n_results=n_results,
        phase=phase,
        category=category,
        target_collection=target_collection,
    )
    return [document.model_dump() for document in result.documents]


def insufficient_evidence(query: str) -> TheoryRetrievalResult:
    return TheoryRetrievalResult(
        status="insufficient_evidence",
        query=query,
        pipeline_version=PIPELINE_VERSION,
        documents=[],
    )


def infer_phase(query: str) -> str | None:
    normalized = normalize_for_matching(query)
    for phase in ("endgame", "middlegame", "opening"):
        if any(term in normalized for term in PHASE_TERMS[phase]):
            return phase
    return None


def normalize_for_matching(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    without_accents = "".join(
        character for character in decomposed if not unicodedata.combining(character)
    )
    return re.sub(r"\s+", " ", without_accents).strip()


def build_metadata_filter(
    phase: str | None,
    category: str | None,
) -> dict[str, Any] | None:
    filters = []
    if phase:
        filters.append({"phase": phase})
    if category:
        filters.append({"category": category})
    if not filters:
        return None
    if len(filters) == 1:
        return filters[0]
    return {"$and": filters}


def collection_count(
    collection: Collection,
    where: dict[str, Any] | None,
) -> int:
    if where is None:
        return collection.count()
    return len(collection.get(where=where, include=[]).get("ids") or [])


def map_query_results(payload: Any) -> list[TheoryEvidence]:
    documents = (payload.get("documents") or [[]])[0]
    metadatas = (payload.get("metadatas") or [[]])[0]
    distances = (payload.get("distances") or [[]])[0]
    return [
        TheoryEvidence(
            text=document,
            metadata=metadata or {},
            distance=float(distance),
        )
        for document, metadata, distance in zip(
            documents,
            metadatas,
            distances,
            strict=False,
        )
    ]
