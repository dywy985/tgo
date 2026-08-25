from __future__ import annotations
import json
from typing import AsyncIterator

from app.domain.entities import StreamEvent
from app.domain.ports import SSEManager


def _json_or_text(s: str):
    try:
        return json.loads(s)
    except Exception:
        return {"text": s}


class DefaultSSEManager(SSEManager):
    async def stream_events(self, frames: AsyncIterator[bytes]) -> AsyncIterator[StreamEvent]:
        """SSE 按行解析。

        frames 来自 HttpxTgoApiClient.chat_completion 的 r.aiter_lines(),
        已是按行分割 (每行不含换行符): 'event: xxx' / 'data: {...}' / 空行。
        """
        buffer_event: str | None = None
        async for b in frames:
            line = b.decode("utf-8", errors="replace").rstrip("\r")
            if not line:
                continue  # SSE 事件分隔空行
            if line.startswith("event:"):
                buffer_event = line[len("event:"):].strip()
            elif line.startswith("data:"):
                payload = _json_or_text(line[len("data:"):].strip())
                yield StreamEvent(event=buffer_event or "event", payload=payload)
                buffer_event = None

    async def aggregate(self, events: AsyncIterator[StreamEvent]) -> dict:
        chunks: list[str] = []
        async for ev in events:
            if ev.event in {"error", "disconnected"}:
                break
            else:
                payload = ev.payload or {}
                et = payload.get("event_type")
                if et in {"team_run_content", "agent_content_chunk"}:
                    data = payload.get("data", {})
                    text = data.get("content") or data.get("content_chunk")
                    if text:
                        chunks.append(text)
                if et == "agent_response_complete":
                    data = payload.get("data", {})
                    final_text = data.get("final_content") or ""
                    if final_text:
                        chunks = [final_text]
                    break
                if et in {"workflow_completed", "team_run_completed", "workflow_failed"}:
                    break
        return {"text": "".join(chunks)}
