from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).parents[1] / "app" / "services" / "public_ticket_submission.py"
SPEC = importlib.util.spec_from_file_location("public_ticket_submission", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PublicTicketSubmissionTests(unittest.TestCase):
    def test_normalizes_customer_contact_fields(self) -> None:
        result = MODULE.normalize_public_ticket_fields(
            title="  安装失败  ",
            description="  出现错误码 1001  ",
            contact_name="  张三  ",
            contact_phone=" +86 138-0013-8000 ",
        )

        self.assertEqual(result["title"], "安装失败")
        self.assertEqual(result["description"], "出现错误码 1001")
        self.assertEqual(result["contact_name"], "张三")
        self.assertEqual(result["contact_phone"], "+86 138-0013-8000")

    def test_rejects_invalid_phone(self) -> None:
        with self.assertRaisesRegex(ValueError, "phone"):
            MODULE.normalize_public_ticket_fields(
                title="问题", description="问题描述", contact_name="张三", contact_phone="abc"
            )

    def test_allows_only_bounded_images(self) -> None:
        self.assertEqual(
            MODULE.validate_ticket_image("proof.png", "image/png", 1024), "proof.png"
        )
        with self.assertRaisesRegex(ValueError, "image type"):
            MODULE.validate_ticket_image("payload.html", "text/html", 1024)
        with self.assertRaisesRegex(ValueError, "8 MB"):
            MODULE.validate_ticket_image("huge.jpg", "image/jpeg", 8 * 1024 * 1024 + 1)

    def test_rejects_mime_type_that_does_not_match_file_signature(self) -> None:
        self.assertEqual(MODULE.detect_image_type(b"\x89PNG\r\n\x1a\nrest"), "image/png")
        self.assertEqual(MODULE.detect_image_type(b"\xff\xd8\xffrest"), "image/jpeg")
        self.assertIsNone(MODULE.detect_image_type(b"<script>alert(1)</script>"))


if __name__ == "__main__":
    unittest.main()
