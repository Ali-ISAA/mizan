"""LiteLLM-based LLM service — provider-agnostic."""
from __future__ import annotations

import logging
from typing import AsyncGenerator

import litellm

from app.config import settings

logger = logging.getLogger(__name__)
litellm.suppress_debug_info = True

_MAX_SUMMARY_CHARS = 60_000
_MAX_ANALYSIS_CHARS = 80_000


def _resolve() -> tuple[str, str | None, str | None]:
    provider = settings.llm_provider.lower()
    model = settings.llm_model
    if provider == "dashscope":
        return f"openai/{model}", settings.dashscope_api_key or None, settings.dashscope_base_url or None
    elif provider == "zai":
        return f"openai/{model}", settings.zai_api_key or None, settings.zai_base_url or None
    elif provider == "ollama":
        return f"ollama_chat/{model}", None, settings.ollama_url or None
    else:
        return model, settings.llm_api_key or None, settings.llm_base_url or None


def _resolve_chat() -> tuple[str, str | None, str | None]:
    provider = (settings.chat_llm_provider or settings.llm_provider).lower()
    model = settings.chat_llm_model or settings.llm_model
    key_override = settings.chat_api_key or None
    base_override = settings.chat_api_base or None
    if provider == "dashscope":
        return f"openai/{model}", key_override or settings.dashscope_api_key or None, base_override or settings.dashscope_base_url or None
    elif provider == "zai":
        return f"openai/{model}", key_override or settings.zai_api_key or None, base_override or settings.zai_base_url or None
    elif provider == "ollama":
        return f"ollama_chat/{model}", None, base_override or settings.ollama_url or None
    else:
        return model, key_override or settings.llm_api_key or None, base_override or settings.llm_base_url or None


async def chat(messages: list[dict], **kwargs) -> str:
    litellm_model, api_key, api_base = _resolve()
    extra: dict = {}
    if api_key:
        extra["api_key"] = api_key
    if api_base:
        extra["api_base"] = api_base
    response = await litellm.acompletion(model=litellm_model, messages=messages, stream=False, **extra, **kwargs)
    return response.choices[0].message.content or ""


async def chat_with_tools(messages: list[dict], tools: list[dict], **kwargs) -> tuple[str | None, list | None]:
    litellm_model, api_key, api_base = _resolve_chat()
    extra: dict = {}
    if api_key:
        extra["api_key"] = api_key
    if api_base:
        extra["api_base"] = api_base
    response = await litellm.acompletion(
        model=litellm_model, messages=messages, tools=tools, tool_choice="auto", stream=False, **extra, **kwargs
    )
    msg = response.choices[0].message
    if msg.tool_calls:
        return None, msg.tool_calls
    return msg.content or "", None


async def chat_stream(messages: list[dict], **kwargs) -> AsyncGenerator[str, None]:
    litellm_model, api_key, api_base = _resolve_chat()
    extra: dict = {}
    if api_key:
        extra["api_key"] = api_key
    if api_base:
        extra["api_base"] = api_base
    response = await litellm.acompletion(model=litellm_model, messages=messages, stream=True, **extra, **kwargs)
    async for chunk in response:
        token = chunk.choices[0].delta.content
        if token:
            yield token


async def generate_summary(text: str, doc_name: str) -> str:
    try:
        if len(text) > _MAX_SUMMARY_CHARS:
            text = text[:_MAX_SUMMARY_CHARS] + "\n\n[...truncated...]"
        messages = [
            {"role": "system", "content": "You are a document analyst. Summarize in 3-5 sentences. Cover main purpose, key facts, important dates/amounts, action items. Be specific and factual."},
            {"role": "user", "content": f"Document: {doc_name}\n\n{text}"},
        ]
        return await chat(messages, max_tokens=600)
    except Exception as exc:
        logger.warning("generate_summary failed for '%s': %s", doc_name, exc)
        return ""


async def extract_requirements(text: str, doc_name: str) -> list[dict]:
    """Extract structured requirements from a requirements/policy document.

    Returns list of {requirement_text, section_ref} dicts.
    """
    try:
        if len(text) > _MAX_ANALYSIS_CHARS:
            text = text[:_MAX_ANALYSIS_CHARS] + "\n\n[...truncated...]"
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a compliance analyst. Extract all requirements, obligations, and mandates from the document. "
                    "Return a JSON array where each item has:\n"
                    "- requirement_text: the exact requirement statement\n"
                    "- section_ref: section/article/clause reference if identifiable (null if not)\n\n"
                    "Focus on SHALL, MUST, REQUIRED, WILL statements. Include each distinct requirement. "
                    "Return ONLY valid JSON, no markdown."
                ),
            },
            {"role": "user", "content": f"Document: {doc_name}\n\n{text}"},
        ]
        result = await chat(messages, max_tokens=4000)
        import json
        # Strip markdown code fences if present
        result = result.strip()
        if result.startswith("```"):
            result = result.split("```")[1]
            if result.startswith("json"):
                result = result[4:]
        return json.loads(result.strip())
    except Exception as exc:
        logger.warning("extract_requirements failed for '%s': %s", doc_name, exc)
        return []


async def assess_compliance(requirement_text: str, matched_chunks: list[str]) -> dict:
    """Assess whether matched document chunks satisfy a requirement.

    Returns {compliance_status, confidence_score, ai_commentary}.
    """
    try:
        context = "\n\n---\n\n".join(matched_chunks[:5]) if matched_chunks else "(no matching content found)"
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a compliance auditor. Assess whether the provided document sections satisfy the given requirement.\n"
                    "Return JSON with:\n"
                    "- compliance_status: 'met' | 'partial' | 'not_met'\n"
                    "- confidence_score: float 0.0-1.0\n"
                    "- ai_commentary: 1-2 sentence explanation\n\n"
                    "Return ONLY valid JSON, no markdown."
                ),
            },
            {
                "role": "user",
                "content": f"REQUIREMENT:\n{requirement_text}\n\nCOMPLIANCE DOCUMENT SECTIONS:\n{context}",
            },
        ]
        result = await chat(messages, max_tokens=300)
        result = result.strip()
        if result.startswith("```"):
            result = result.split("```")[1]
            if result.startswith("json"):
                result = result[4:]
        import json
        return json.loads(result.strip())
    except Exception as exc:
        logger.warning("assess_compliance failed: %s", exc)
        return {"compliance_status": "not_met", "confidence_score": 0.0, "ai_commentary": "Assessment failed."}


async def generate_gap_recommendation(requirement_text: str, status: str) -> str:
    """Generate a recommendation for addressing a compliance gap."""
    try:
        messages = [
            {"role": "system", "content": "You are a compliance consultant. Provide a concise 1-2 sentence actionable recommendation to address this compliance gap."},
            {"role": "user", "content": f"Requirement: {requirement_text}\nStatus: {status}"},
        ]
        return await chat(messages, max_tokens=150)
    except Exception as exc:
        logger.warning("generate_gap_recommendation failed: %s", exc)
        return ""


async def generate_executive_summary(
    overall_score: float,
    met: int,
    partial: int,
    not_met: int,
    critical_gaps: int,
    doc_a_name: str,
    doc_b_name: str,
) -> str:
    """Generate a 2-3 paragraph executive summary of the compliance analysis."""
    try:
        messages = [
            {"role": "system", "content": "You are a compliance analyst. Write a clear 2-3 paragraph executive summary of a compliance analysis. Be specific and professional."},
            {
                "role": "user",
                "content": (
                    f"Requirements document: {doc_a_name}\n"
                    f"Compliance document: {doc_b_name}\n"
                    f"Overall compliance score: {overall_score:.1f}%\n"
                    f"Requirements: {met} met, {partial} partially met, {not_met} not met\n"
                    f"Critical gaps: {critical_gaps}\n\n"
                    "Write an executive summary."
                ),
            },
        ]
        return await chat(messages, max_tokens=500)
    except Exception as exc:
        logger.warning("generate_executive_summary failed: %s", exc)
        return ""
