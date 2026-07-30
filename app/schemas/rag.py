from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

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
    provider: Literal["lichess-study", "wikimedia-page"]
    title: str = Field(min_length=1)
    category: str = Field(min_length=1)
    phase: RagPhase
    topic: str = Field(min_length=1)
    language: str = Field(min_length=2)
    enabled: bool = True
    page_title: str | None = None
    revision_id: int | None = Field(default=None, gt=0)
    source_url: str | None = None
    attribution_url: str | None = None
    author: str | None = None
    content_license: str | None = None
    license_url: str | None = None
    excluded_sections: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_provider_fields(self) -> "RagSource":
        if self.provider != "wikimedia-page":
            return self
        required = {
            "page_title": self.page_title,
            "revision_id": self.revision_id,
            "source_url": self.source_url,
            "attribution_url": self.attribution_url,
            "author": self.author,
            "content_license": self.content_license,
            "license_url": self.license_url,
        }
        missing = [field for field, value in required.items() if not value]
        if missing:
            raise ValueError(
                "Wikimedia source is missing required provenance fields: "
                + ", ".join(missing)
            )
        return self


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
