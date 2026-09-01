from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).parents[1] / "app" / "domain" / "services" / "ticket_fallback.py"
SPEC = importlib.util.spec_from_file_location("ticket_fallback", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class TicketFallbackTests(unittest.TestCase):
    def test_message_includes_customer_form_link(self):
        text = MODULE.build_ticket_fallback_text("https://service.example/form/abc")

        self.assertIn("暂未能及时答复", text)
        self.assertIn("https://service.example/form/abc", text)
        self.assertIn("联系人", text)

    def test_empty_link_uses_safe_manual_service_message(self):
        text = MODULE.build_ticket_fallback_text("")

        self.assertNotIn("http", text)
        self.assertIn("人工客服", text)


if __name__ == "__main__":
    unittest.main()
