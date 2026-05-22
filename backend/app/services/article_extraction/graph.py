"""
Builds and compiles the LangGraph article extraction graph.

Graph: fetch_markdown → analyze_document → extract_articles
                      → validate_extraction → save_to_db → END
"""
from __future__ import annotations

import logging

from langgraph.graph import StateGraph, END

from app.services.article_extraction.state import ExtractionState
from app.services.article_extraction.nodes import (
    fetch_markdown,
    analyze_document,
    extract_articles,
    validate_extraction,
    save_to_db,
)

logger = logging.getLogger(__name__)


def build_graph() -> StateGraph:
    """Return a compiled LangGraph graph for article extraction."""
    builder = StateGraph(ExtractionState)

    builder.add_node("fetch_markdown", fetch_markdown)
    builder.add_node("analyze_document", analyze_document)
    builder.add_node("extract_articles", extract_articles)
    builder.add_node("validate_extraction", validate_extraction)
    builder.add_node("save_to_db", save_to_db)

    builder.set_entry_point("fetch_markdown")
    builder.add_edge("fetch_markdown", "analyze_document")
    builder.add_edge("analyze_document", "extract_articles")
    builder.add_edge("extract_articles", "validate_extraction")
    builder.add_edge("validate_extraction", "save_to_db")
    builder.add_edge("save_to_db", END)

    return builder.compile()


_graph = None


def _get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


async def run_extraction_agent(document_id: str, document_type: str) -> None:
    """
    Entry point called by the Celery task.
    Builds initial state, runs the graph, and returns when done.
    """
    initial_state: ExtractionState = {
        "document_id": document_id,
        "document_type": document_type,
        "markdown": "",
        "analysis": {},
        "articles": [],
        "validated_articles": [],
        "error": None,
    }
    graph = _get_graph()
    final_state = await graph.ainvoke(initial_state)
    logger.info(
        "run_extraction_agent complete: doc=%s articles=%d error=%s",
        document_id,
        len(final_state.get("validated_articles", [])),
        final_state.get("error"),
    )
