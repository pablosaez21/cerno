from typing import Any, Literal

from pydantic import BaseModel, Field

RetrievalStatus = Literal["evidence_found", "insufficient_evidence"]
RagPhase = Literal["opening", "middlegame", "endgame", "unknown"]


class TheoryEvidence(BaseModel):
    text: str
    metadata: dict[str, Any]
    distance: float


class TheoryRetrievalResult(BaseModel):
    status: RetrievalStatus
    query: str
    pipeline_version: str
    documents: list[TheoryEvidence]


class RagSource(BaseModel):
    id: str = Field(min_length=1)
    provider: Literal["lichess-study"]
    title: str = Field(min_length=1)
    category: str = Field(min_length=1)
    phase: RagPhase
    topic: str = Field(min_length=1)
    language: str = Field(min_length=2)
    enabled: bool = True


class RagManifest(BaseModel):
    manifest_version: str
    pipeline_version: str
    embedding_version: str
    sources: list[RagSource]


class SourceIndexReport(BaseModel):
    source_id: str
    indexed_chunks: int
    stale_chunks_deleted: int
    unchanged: bool


class ReconciliationReport(BaseModel):
    manifest_sources: list[str]
    indexed_sources: list[str]
    missing_sources: list[str]
    unexpected_sources: list[str]
    orphan_chunk_ids: list[str]
    incomplete_chunk_ids: list[str]
    duplicate_content_hashes: dict[str, list[str]]
    version_mismatch_chunk_ids: list[str]
    deleted_chunk_ids: list[str]
