"""Read-only knowledge-base suggestions for human reply monitoring."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.services.rag_client import rag_client as default_rag_client
from app.services.reply_monitor_classifier import MEDIA_PLACEHOLDERS, normalize_problem_text


@dataclass(frozen=True)
class KnowledgeSuggestion:
    document_id: str
    collection_id: str
    collection_name: str
    title: str
    suggested_reply: str
    relevance_score: float


@dataclass(frozen=True)
class KnowledgeSuggestionResult:
    query: str
    collection_count: int
    items: list[KnowledgeSuggestion]


def _rows(payload: Any, *keys: str) -> list[dict]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if not isinstance(payload, dict):
        return []
    for key in keys:
        value = payload.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]
    nested = payload.get("data")
    if isinstance(nested, dict):
        return _rows(nested, *keys)
    return []


async def get_knowledge_suggestions(
    *,
    project_id: UUID,
    query: str,
    rag_client=default_rag_client,
    min_score: float = 0.2,
    limit: int = 5,
) -> KnowledgeSuggestionResult:
    normalized = normalize_problem_text(query)
    if not normalized or normalized in MEDIA_PLACEHOLDERS:
        return KnowledgeSuggestionResult(normalized, 0, [])

    collections_payload = await rag_client.list_collections(
        str(project_id), limit=100, offset=0
    )
    collections = [
        row for row in _rows(collections_payload, "items", "collections", "data")
        if str(row.get("status") or "active").lower() not in {"inactive", "disabled", "deleted"}
        and row.get("is_active", True) is not False
    ]
    suggestions: list[KnowledgeSuggestion] = []
    seen: set[str] = set()
    for collection in collections:
        collection_id = str(collection.get("id") or collection.get("collection_id") or "")
        if not collection_id:
            continue
        search_payload = await rag_client.search_collection_documents(
            str(project_id), collection_id,
            {"query": normalized, "limit": min(10, limit), "search_mode": "hybrid"},
        )
        for row in _rows(search_payload, "results", "items", "data"):
            preview = " ".join(str(row.get("content_preview") or row.get("content") or "").split())
            if not preview:
                continue
            try:
                score = float(row.get("relevance_score") or row.get("score") or 0)
            except (TypeError, ValueError):
                score = 0.0
            if score < min_score:
                continue
            fingerprint = preview.casefold()
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            suggestions.append(KnowledgeSuggestion(
                document_id=str(row.get("document_id") or row.get("id") or ""),
                collection_id=collection_id,
                collection_name=str(collection.get("display_name") or collection.get("name") or "知识库"),
                title=str(row.get("document_title") or row.get("title") or row.get("section_title") or "知识库资料"),
                suggested_reply=preview[:1200],
                relevance_score=score,
            ))
    suggestions.sort(key=lambda item: item.relevance_score, reverse=True)
    return KnowledgeSuggestionResult(normalized, len(collections), suggestions[:limit])
