from __future__ import annotations

import unittest
from unittest.mock import AsyncMock

from app.domain.services.receipt_ack import InMemoryReceiptAckClaimStore, ReceiptAckService


class FakeClaimStore:
    def __init__(self, result: str = "send") -> None:
        self.claim = AsyncMock(return_value=result)
        self.release = AsyncMock()


class FakeAdapter:
    def __init__(self) -> None:
        self.send_final = AsyncMock()


class ReceiptAckServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_memory_store_deduplicates_message_and_conversation(self) -> None:
        store = InMemoryReceiptAckClaimStore()

        first = await store.claim(
            platform_id="platform-1",
            message_id="message-1",
            conversation_id="customer-group",
            cooldown_seconds=45,
        )
        duplicate = await store.claim(
            platform_id="platform-1",
            message_id="message-1",
            conversation_id="customer-group",
            cooldown_seconds=45,
        )
        cooldown = await store.claim(
            platform_id="platform-1",
            message_id="message-2",
            conversation_id="customer-group",
            cooldown_seconds=45,
        )

        self.assertEqual(first, "send")
        self.assertEqual(duplicate, "duplicate")
        self.assertEqual(cooldown, "cooldown")

    async def test_sends_default_receipt_before_ai_can_start(self) -> None:
        events: list[str] = []
        store = FakeClaimStore()
        adapter = FakeAdapter()
        adapter.send_final.side_effect = lambda _content: events.append("receipt")
        service = ReceiptAckService(store)

        result = await service.send_if_due(
            adapter=adapter,
            platform_id="platform-1",
            message_id="message-1",
            conversation_id="customer-group",
            platform_config={},
            is_from_colleague=False,
            source_type="worktool",
            msg_type="text",
        )
        events.append("ai")

        self.assertEqual(result, "sent")
        self.assertEqual(events, ["receipt", "ai"])
        adapter.send_final.assert_awaited_once_with(
            {"text": "您好，您的消息已收到，正在为您查询处理，请稍候。"}
        )
        store.claim.assert_awaited_once_with(
            platform_id="platform-1",
            message_id="message-1",
            conversation_id="customer-group",
            cooldown_seconds=45,
        )

    async def test_does_not_repeat_receipt_for_duplicate_or_cooldown(self) -> None:
        for claim_result in ("duplicate", "cooldown"):
            with self.subTest(claim_result=claim_result):
                store = FakeClaimStore(claim_result)
                adapter = FakeAdapter()
                service = ReceiptAckService(store)

                result = await service.send_if_due(
                    adapter=adapter,
                    platform_id="platform-1",
                    message_id="message-1",
                    conversation_id="customer-group",
                    platform_config={},
                    is_from_colleague=False,
                    source_type="worktool",
                    msg_type="text",
                )

                self.assertEqual(result, claim_result)
                adapter.send_final.assert_not_awaited()

    async def test_does_not_acknowledge_staff_or_self_messages(self) -> None:
        store = FakeClaimStore()
        adapter = FakeAdapter()
        service = ReceiptAckService(store)

        result = await service.send_if_due(
            adapter=adapter,
            platform_id="platform-1",
            message_id="message-1",
            conversation_id="customer-group",
            platform_config={},
            is_from_colleague=True,
            source_type="worktool",
            msg_type="text",
        )

        self.assertEqual(result, "ineligible")
        store.claim.assert_not_awaited()
        adapter.send_final.assert_not_awaited()

    async def test_releases_claim_when_channel_send_fails(self) -> None:
        store = FakeClaimStore()
        adapter = FakeAdapter()
        adapter.send_final.side_effect = RuntimeError("gateway unavailable")
        service = ReceiptAckService(store)

        with self.assertRaisesRegex(RuntimeError, "gateway unavailable"):
            await service.send_if_due(
                adapter=adapter,
                platform_id="platform-1",
                message_id="message-1",
                conversation_id="customer-group",
                platform_config={"receipt_ack": {"cooldown_seconds": 30}},
                is_from_colleague=False,
                source_type="worktool",
                msg_type="text",
            )

        store.release.assert_awaited_once_with(
            platform_id="platform-1",
            message_id="message-1",
            conversation_id="customer-group",
        )


if __name__ == "__main__":
    unittest.main()
