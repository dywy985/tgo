from __future__ import annotations

import hashlib
from typing import Any, Dict


def build_integrity_metadata(content: bytes, filename: str, content_type: str) -> Dict[str, Any]:
    """Describe source-byte preservation separately from lossy text extraction."""
    canonical_format = "markdown" if content_type == "text/markdown" else "original_binary"
    risks = []
    if content_type == "application/pdf":
        risks = ["layout", "tables", "images", "scanned_pages"]
    elif content_type in {
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }:
        risks = ["layout", "tables", "images", "headers_footers"]
    elif content_type == "text/html":
        risks = ["dynamic_content", "layout", "embedded_media"]

    return {
        "original_filename": filename,
        "sha256": hashlib.sha256(content).hexdigest(),
        "source_bytes": len(content),
        "original_preserved": True,
        "canonical_format": canonical_format,
        "extraction_risks": risks,
        "extraction_review_required": bool(risks),
    }
