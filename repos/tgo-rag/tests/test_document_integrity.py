import hashlib
import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).parents[1] / "src" / "rag_service" / "services" / "document_integrity.py"
SPEC = importlib.util.spec_from_file_location("document_integrity", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DocumentIntegrityTests(unittest.TestCase):
    def test_manifest_proves_original_bytes_are_preserved(self):
        content = b"# Product\nExact source"
        manifest = MODULE.build_integrity_metadata(content, "manual.md", "text/markdown")

        self.assertEqual(manifest["sha256"], hashlib.sha256(content).hexdigest())
        self.assertEqual(manifest["source_bytes"], len(content))
        self.assertTrue(manifest["original_preserved"])
        self.assertEqual(manifest["canonical_format"], "markdown")

    def test_pdf_requires_extraction_review_without_claiming_lossless_text(self):
        manifest = MODULE.build_integrity_metadata(b"%PDF", "scan.pdf", "application/pdf")

        self.assertEqual(manifest["canonical_format"], "original_binary")
        self.assertIn("layout", manifest["extraction_risks"])
        self.assertIn("scanned_pages", manifest["extraction_risks"])


if __name__ == "__main__":
    unittest.main()
