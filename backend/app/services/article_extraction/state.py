from __future__ import annotations
from typing import TypedDict


class DocumentAnalysis(TypedDict):
    """LLM's understanding of the document structure."""
    document_type: str
    article_unit: str
    numbering_format: str
    language: str
    estimated_count: int


class ExtractionState(TypedDict):
    # ── Inputs ──────────────────────────────────────────────────────────────
    document_id: str
    document_type: str

    # ── Intermediate ────────────────────────────────────────────────────────
    markdown: str
    analysis: DocumentAnalysis

    # ── Outputs ─────────────────────────────────────────────────────────────
    articles: list[dict]
    validated_articles: list[dict]
    error: str | None
