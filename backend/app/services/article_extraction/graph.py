"""
Builds and compiles the LangGraph article extraction graph.

Graph: fetch_markdown → regex_extract → [llm_extract if regex found nothing] → save_to_db → END
"""
from __future__ import annotations

import logging

from langgraph.graph import StateGraph, END

from app.services.article_extraction.state import ExtractionState
from app.services.article_extraction.nodes import (
    fetch_markdown,
    regex_extract,
    llm_extract,
    save_to_db,
)

logger = logging.getLogger(__name__)


def _after_regex(state: ExtractionState) -> str:
    """Route to LLM extraction only when regex found nothing and no fatal error occurred."""
    if state.get("error"):
        return "save_to_db"
    if state.get("validated_articles"):
        return "save_to_db"
    return "llm_extract"


def build_graph() -> StateGraph:
    """Return a compiled LangGraph graph for article extraction."""
    builder = StateGraph(ExtractionState)

    builder.add_node("fetch_markdown", fetch_markdown)
    builder.add_node("regex_extract", regex_extract)
    builder.add_node("llm_extract", llm_extract)
    builder.add_node("save_to_db", save_to_db)

    builder.set_entry_point("fetch_markdown")
    builder.add_edge("fetch_markdown", "regex_extract")
    builder.add_conditional_edges(
        "regex_extract",
        _after_regex,
        {"save_to_db": "save_to_db", "llm_extract": "llm_extract"},
    )
    builder.add_edge("llm_extract", "save_to_db")
    builder.add_edge("save_to_db", END)

    return builder.compile()


_graph = None


def _get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


async def run_extraction_agent(document_id: str, document_type: str) -> None:
    """Entry point called by the Celery task."""
    initial_state: ExtractionState = {
        "document_id": document_id,
        "document_type": document_type,
        "markdown": "",
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
