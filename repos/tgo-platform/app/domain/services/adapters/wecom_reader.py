from __future__ import annotations

import logging

import httpx

from app.domain.entities import StreamEvent
from app.domain.services.adapters.base import BasePlatformAdapter


class WeComReaderAdapter(BasePlatformAdapter):
    """Outbound adapter for the wecom_reader bridge (本地企微监控桥).

    Sends AI replies to the WeCom group by calling the bridge's aibot
    long-connection send service over HTTP. The bridge (Windows side)
    holds the 企微智能机器人 WebSocket long connection and pushes
    markdown/text to the target chatid.

    Config (platform.config):
      send_base_url: 桥接发送服务地址, 如 http://host.docker.internal:8791
      send_token:    可选, 发送服务鉴权 token
    Target chatid comes from msg.extra.wecom_reader.chatid (wr_xxx).
    """

    supports_stream = False

    def __init__(
        self,
        send_base_url: str = "",
        chatid: str = "",
        send_token: str = "",
        http_timeout: float = 30.0,
    ) -> None:
        self.send_base_url = (send_base_url or "").rstrip("/")
        self.chatid = chatid
        self.send_token = send_token
        self.http_timeout = http_timeout

    async def send_incremental(self, ev: StreamEvent) -> None:
        # 本地监控桥不支持流式输出; 忽略增量事件
        return

    async def send_final(self, content: dict) -> None:
        text = (content or {}).get("text") or ""
        if not text:
            return
        if not self.send_base_url:
            raise RuntimeError("WeComReaderAdapter requires send_base_url (桥接发送服务地址)")
        if not self.chatid:
            logging.warning("[WECOM_READER] 无 chatid, 跳过回复 (无法确定推送目标)")
            return

        headers = {}
        if self.send_token:
            headers["X-Send-Token"] = self.send_token
        payload = {"chatid": self.chatid, "content": text[:20480], "msgtype": "markdown"}
        try:
            async with httpx.AsyncClient(timeout=self.http_timeout) as client:
                resp = await client.post(f"{self.send_base_url}/api/send", json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                if data.get("ok") is False:
                    raise RuntimeError(f"桥接发送失败: {data.get('error') or data}")
        except Exception as e:
            raise RuntimeError(f"桥接发送服务调用失败: {e}") from e
