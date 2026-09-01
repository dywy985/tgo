from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).parents[1] / "app" / "services" / "public_ticket_token.py"
SPEC = importlib.util.spec_from_file_location("public_ticket_token", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
InvalidPublicTicketToken = MODULE.InvalidPublicTicketToken
decode_public_ticket_token = MODULE.decode_public_ticket_token
issue_public_ticket_token = MODULE.issue_public_ticket_token


class PublicTicketTokenTests(unittest.TestCase):
    def test_round_trip_keeps_tenant_and_customer_context(self) -> None:
        token = issue_public_ticket_token(
            secret="test-secret",
            project_id="project-1",
            visitor_id="visitor-1",
            platform_id="platform-1",
            group_key="客户群",
            expires_at=2_000,
        )

        payload = decode_public_ticket_token(token, secret="test-secret", now=1_000)

        self.assertEqual(payload["project_id"], "project-1")
        self.assertEqual(payload["visitor_id"], "visitor-1")
        self.assertEqual(payload["platform_id"], "platform-1")
        self.assertEqual(payload["group_key"], "客户群")
        self.assertEqual(payload["purpose"], "public_ticket")

    def test_rejects_tampered_token(self) -> None:
        token = issue_public_ticket_token(
            secret="test-secret",
            project_id="project-1",
            visitor_id=None,
            platform_id=None,
            group_key=None,
            expires_at=2_000,
        )

        with self.assertRaises(InvalidPublicTicketToken):
            decode_public_ticket_token(token + "x", secret="test-secret", now=1_000)

    def test_rejects_expired_token(self) -> None:
        token = issue_public_ticket_token(
            secret="test-secret",
            project_id="project-1",
            visitor_id=None,
            platform_id=None,
            group_key=None,
            expires_at=999,
        )

        with self.assertRaisesRegex(InvalidPublicTicketToken, "expired"):
            decode_public_ticket_token(token, secret="test-secret", now=1_000)


if __name__ == "__main__":
    unittest.main()
