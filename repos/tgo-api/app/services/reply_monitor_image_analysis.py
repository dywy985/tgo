"""Fail-open OCR analysis for reply-monitor images."""

from __future__ import annotations

from dataclasses import dataclass
import subprocess
from typing import Callable

from app.services.reply_monitor_classifier import classify_problem_text


@dataclass(frozen=True)
class ImageTextAnalysis:
    status: str
    text: str
    problem_score: int
    problem_rule_version: str | None
    problem_reasons: tuple[str, ...]
    error_code: str | None = None


def analyze_image_text(
    content: bytes,
    *,
    runner: Callable = subprocess.run,
    timeout_seconds: int = 20,
) -> ImageTextAnalysis:
    """Run local Tesseract against a normalized image without blocking upload failures."""
    try:
        completed = runner(
            ["tesseract", "stdin", "stdout", "-l", "chi_sim+eng", "--psm", "6"],
            input=content,
            capture_output=True,
            text=False,
            timeout=timeout_seconds,
            check=False,
        )
    except FileNotFoundError:
        return ImageTextAnalysis("unavailable", "", 0, None, (), "engine_unavailable")
    except subprocess.TimeoutExpired:
        return ImageTextAnalysis("failed", "", 0, None, (), "timeout")
    except OSError:
        return ImageTextAnalysis("failed", "", 0, None, (), "engine_error")

    stdout = completed.stdout or b""
    stderr = completed.stderr or b""
    if isinstance(stdout, bytes):
        text = stdout.decode("utf-8", errors="replace").strip()
    else:
        text = str(stdout).strip()
    if completed.returncode != 0:
        error_text = stderr.decode("utf-8", errors="replace") if isinstance(stderr, bytes) else str(stderr)
        code = "language_unavailable" if "failed loading language" in error_text.casefold() else "recognition_failed"
        return ImageTextAnalysis("failed", "", 0, None, (), code)
    if not text:
        return ImageTextAnalysis("no_text", "", 0, None, ())

    classification = classify_problem_text(text, message_type="text")
    return ImageTextAnalysis(
        "recognized",
        text,
        classification.score,
        classification.rule_version,
        classification.reasons,
    )
