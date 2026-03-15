"""Direct Qdrant vector search for Mizan."""
import asyncio
import logging
from typing import Optional

import httpx
from qdrant_client import QdrantClient
from qdrant_client.models import FieldCondition, Filter, MatchValue, PayloadSchemaType

from app.config import settings

logger = logging.getLogger(__name__)
_indexed_collections: set[str] = set()


def _qdrant_client() -> QdrantClient:
    url = settings.qdrant_host or settings.qdrant_url
    api_key = settings.qdrant_api_key or None
    return QdrantClient(url=url, api_key=api_key)


async def _embed(query: str) -> list[float]:
    url = settings.ollama_url.rstrip("/") + "/api/embeddings"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json={"model": settings.ollama_embed_model, "prompt": query})
        resp.raise_for_status()
        return resp.json()["embedding"]


def _ensure_indexes(client: QdrantClient, collection_name: str, filter_keys: list[str]) -> None:
    for key in filter_keys:
        try:
            client.create_payload_index(collection_name=collection_name, field_name=key, field_schema=PayloadSchemaType.KEYWORD)
        except Exception:
            pass


def _search_sync(collection_name: str, query_vector: list[float], top_k: int, metadata_filters: dict) -> list[dict]:
    client = _qdrant_client()
    try:
        if collection_name not in _indexed_collections and metadata_filters:
            _ensure_indexes(client, collection_name, list(metadata_filters.keys()))
            _indexed_collections.add(collection_name)
        query_filter = None
        if metadata_filters:
            conditions = [FieldCondition(key=k, match=MatchValue(value=v)) for k, v in metadata_filters.items()]
            query_filter = Filter(must=conditions)
        response = client.query_points(
            collection_name=collection_name, query=query_vector, limit=top_k,
            query_filter=query_filter, with_payload=True, with_vectors=False,
        )
        results = []
        for point in response.points:
            payload = dict(point.payload) if point.payload else {}
            text = payload.pop("text", "")
            results.append({"id": str(point.id), "text": text, "score": float(point.score), "metadata": payload})
        return results
    finally:
        client.close()


def _scroll_by_field_sync(collection_name: str, field: str, value: str) -> list[dict]:
    client = _qdrant_client()
    try:
        _ensure_indexes(client, collection_name, [field])
        query_filter = Filter(must=[FieldCondition(key=field, match=MatchValue(value=value))])
        all_chunks: list[dict] = []
        offset = None
        while True:
            results, next_offset = client.scroll(
                collection_name=collection_name, scroll_filter=query_filter,
                limit=100, offset=offset, with_payload=True, with_vectors=False,
            )
            for point in results:
                payload = dict(point.payload) if point.payload else {}
                text = payload.get("text", "")
                if text:
                    all_chunks.append({"text": text})
            if next_offset is None:
                break
            offset = next_offset
        return all_chunks
    finally:
        client.close()


async def scroll_chunks_by_doc_id(collection_name: str, doc_id: str) -> list[dict]:
    try:
        return await asyncio.to_thread(_scroll_by_field_sync, collection_name, "object_id", doc_id)
    except Exception as exc:
        logger.warning("Qdrant scroll failed (collection=%s doc_id=%s): %s", collection_name, doc_id, exc)
        return []


async def scroll_chunks_by_noesia_id(collection_name: str, noesia_id: str) -> list[dict]:
    try:
        return await asyncio.to_thread(_scroll_by_field_sync, collection_name, "document_id", noesia_id)
    except Exception as exc:
        logger.warning("Qdrant scroll by noesia_id failed: %s", exc)
        return []


async def search(collection_name: str, query: str, top_k: int = 10, metadata_filters: Optional[dict] = None) -> list[dict]:
    try:
        query_vector = await _embed(query)
    except Exception as exc:
        logger.warning("Ollama embedding failed (query=%r): %s", query[:60], exc)
        return []
    try:
        return await asyncio.to_thread(_search_sync, collection_name, query_vector, top_k, metadata_filters or {})
    except Exception as exc:
        logger.warning("Qdrant search failed (collection=%s): %s", collection_name, exc)
        return []
