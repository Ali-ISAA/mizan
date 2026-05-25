from __future__ import annotations
from typing import TypedDict


class ExtractionState(TypedDict):
    # ── Inputs ──────────────────────────────────────────────────────────────
    document_id: str
    document_type: str

    # ── Intermediate ────────────────────────────────────────────────────────
    markdown: str

    # ── Outputs ─────────────────────────────────────────────────────────────
    validated_articles: list[dict]
    error: str | None
