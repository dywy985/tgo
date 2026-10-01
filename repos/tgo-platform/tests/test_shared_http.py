from __future__ import annotations

import unittest

from app.domain.services.shared_http import AsyncClientPool


class AsyncClientPoolTests(unittest.IsolatedAsyncioTestCase):
    async def test_same_key_reuses_one_client(self) -> None:
        created = []

        def factory():
            client = FakeClient()
            created.append(client)
            return client

        pool = AsyncClientPool()

        first = pool.get("worktool", factory)
        second = pool.get("worktool", factory)

        self.assertIs(first, second)
        self.assertEqual(len(created), 1)

    async def test_close_all_closes_and_discards_clients(self) -> None:
        pool = AsyncClientPool()
        first = pool.get("worktool", FakeClient)

        await pool.close_all()
        second = pool.get("worktool", FakeClient)

        self.assertTrue(first.closed)
        self.assertIsNot(first, second)


class FakeClient:
    def __init__(self) -> None:
        self.closed = False

    async def aclose(self) -> None:
        self.closed = True


if __name__ == "__main__":
    unittest.main()
