import asyncio
from uuid import uuid4

from app.services.reply_monitor_suggestion_service import get_knowledge_suggestions


class _RagClient:
    async def list_collections(self, project_id, limit=100, offset=0):
        return {"data": [
            {"id": "kb-a", "display_name": "操作手册", "status": "active"},
            {"id": "kb-b", "display_name": "旧资料", "status": "inactive"},
        ]}

    async def search_collection_documents(self, project_id, collection_id, search_data):
        assert search_data["query"] == "系统打印不了"
        return {"results": [
            {"id": "doc-1", "title": "打印故障处理", "content_preview": "先检查打印服务，再重新连接打印机。", "relevance_score": 0.91},
            {"id": "doc-2", "title": "弱相关", "content_preview": "无关内容", "relevance_score": 0.05},
        ]}


def test_suggestions_search_active_collections_and_filter_weak_results():
    result = asyncio.run(get_knowledge_suggestions(
        project_id=uuid4(), query="系统打印不了", rag_client=_RagClient(), min_score=0.2,
    ))

    assert result.query == "系统打印不了"
    assert result.collection_count == 1
    assert len(result.items) == 1
    assert result.items[0].title == "打印故障处理"
    assert result.items[0].suggested_reply == "先检查打印服务，再重新连接打印机。"
    assert result.items[0].collection_name == "操作手册"


def test_suggestions_do_not_call_rag_for_blank_question():
    result = asyncio.run(get_knowledge_suggestions(
        project_id=uuid4(), query=" [图片] ", rag_client=_RagClient(),
    ))

    assert result.items == []
    assert result.collection_count == 0
