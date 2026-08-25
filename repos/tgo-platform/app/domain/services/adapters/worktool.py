from __future__ import annotations

import logging

import httpx

from app.domain.entities import StreamEvent
from app.domain.services.adapters.base import BasePlatformAdapter


class WorkToolAdapter(BasePlatformAdapter):
    """Outbound adapter for the WorkTool channel (手机无障碍通道).

    Sends AI replies to the WeCom group by calling the WorkTool gateway
    (Windows side) over HTTP. The gateway pushes a type=203 send command
    to the phone APP, which types the message into the target group.

    Config (platform.config):
      gateway_url:  WorkTool 网关地址, 如 http://172.26.192.1:8790
      robot_id:     手机 APP 的 robot_id (网关鉴权 + 目标手机)
      api_key:      可选, 网关 X-API-Key (WT_API_KEY)
    Target: msg.extra.wecom_reader.chatid 存的是群名 (WorkTool 按群名精确匹配).
    """

    supports_stream = False

    def __init__(
        self,
        gateway_url: str = "",
        robot_id: str = "",
        chatid: str = "",
        api_key: str = "",
        http_timeout: float = 30.0,
    ) -> None:
        self.gateway_url = (gateway_url or "").rstrip("/")
        self.robot_id = robot_id
        self.chatid = chatid
        self.api_key = api_key
        self.http_timeout = http_timeout

    async def send_incremental(self, ev: StreamEvent) -> None:
        # WorkTool 不支持流式输出; 忽略增量事件
        return

    async def send_final(self, content: dict) -> None:
        text = (content or {}).get("text") or ""
        if not text:
            return
        if not self.gateway_url or not self.robot_id:
            raise RuntimeError("WorkToolAdapter requires gateway_url and robot_id (平台配置)")
        if not self.chatid:
            logging.warning("[WORKTOOL] 无群名 (chatid), 跳过回复")
            return

        headers = {}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        payload = {"robot_id": self.robot_id, "title": chatid, "content": text[:20480]}
        try:
            async with httpx.AsyncClient(timeout=self.http_timeout) as client:
                resp = await client.post(f"{self.gateway_url}/api/send", json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                if data.get("status") != "queued":
                    raise RuntimeError(f"网关返回异常: {data}")
        except Exception as e:
            raise RuntimeError(f"WorkTool 网关调用失败: {e}") from e
