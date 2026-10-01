import subprocess
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from app.models import Staff
from app.models.reply_monitor import ReplyMonitorBatch, ReplyMonitorMedia, ReplyMonitorSettings
from app.services.reply_monitor_image_analysis import ImageTextAnalysis, analyze_image_text
from app.services.reply_monitor_service import apply_image_text_analysis


def test_ocr_text_is_classified_with_existing_problem_rules():
    def runner(*args, **kwargs):
        return subprocess.CompletedProcess(args[0], 0, stdout="系统打印不了，请帮忙看看\n", stderr="")

    result = analyze_image_text(b"normalized-image", runner=runner)

    assert result.status == "recognized"
    assert result.text == "系统打印不了，请帮忙看看"
    assert result.problem_score >= 50
    assert "打印不了" in result.text
    assert result.problem_reasons


def test_ocr_missing_binary_does_not_block_media_upload():
    def runner(*args, **kwargs):
        raise FileNotFoundError("tesseract")

    result = analyze_image_text(b"normalized-image", runner=runner)

    assert result.status == "unavailable"
    assert result.text == ""
    assert result.problem_score == 0
    assert result.error_code == "engine_unavailable"


def test_ocr_blank_result_is_not_promoted_to_problem():
    def runner(*args, **kwargs):
        return subprocess.CompletedProcess(args[0], 0, stdout="  \n", stderr="")

    result = analyze_image_text(b"normalized-image", runner=runner)

    assert result.status == "no_text"
    assert result.problem_score == 0


class _Query:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args): return self
    def with_for_update(self): return self
    def first(self): return self.rows[0] if self.rows else None
    def update(self, values, synchronize_session=False):
        for row in self.rows:
            for key, value in values.items():
                setattr(row, key.key, value)
        return len(self.rows)


class _Db:
    def __init__(self, settings, staff_id, media):
        self.settings = settings
        self.staff_id = staff_id
        self.media = media
        self.batches = []
        self.commits = 0

    def get(self, model, key):
        return self.settings if model is ReplyMonitorSettings else None

    def query(self, model):
        if model is ReplyMonitorBatch: return _Query(self.batches)
        if model is ReplyMonitorMedia: return _Query([self.media])
        if model is Staff.id: return _Query([(self.staff_id,)])
        return _Query([])

    def add(self, row):
        if isinstance(row, ReplyMonitorBatch): self.batches.append(row)

    def flush(self):
        for row in self.batches:
            if row.id is None: row.id = uuid4()

    def commit(self): self.commits += 1


def test_recognized_customer_image_opens_timed_pending_batch():
    project_id, platform_id, staff_id = uuid4(), uuid4(), uuid4()
    settings = SimpleNamespace(
        timezone="Asia/Shanghai", weekly_schedule={str(day): [{"start": "00:00", "end": "23:59"}] for day in range(7)},
        first_reminder_minutes=30,
    )
    media = SimpleNamespace(event_id=uuid4(), batch_id=None)
    db = _Db(settings, staff_id, media)
    occurred_at = datetime(2026, 9, 18, 2, 0, tzinfo=timezone.utc)
    event = SimpleNamespace(
        id=media.event_id, event_metadata={}, sender_kind="customer", batch_id=None,
        sender_id="customer-1", sender_name="客户甲", conversation_key="private-1",
        conversation_type="private", conversation_name="客户甲", channel_open_id="open-1",
        occurred_at=occurred_at, normalized_content=None, problem_rule_version=None,
        problem_reasons=None, responsible_staff_id=None,
    )
    platform = SimpleNamespace(id=platform_id, project_id=project_id)
    analysis = ImageTextAnalysis(
        "recognized", "系统打印不了", 100, "reply-monitor-rules-v3", ("issue", "business")
    )
    event.event_metadata = {"bound_staff_id": str(staff_id)}

    batch = apply_image_text_analysis(db, platform, event, analysis)

    assert batch is not None
    assert batch.first_customer_at == occurred_at
    assert batch.next_reminder_at > occurred_at
    assert event.batch_id == batch.id
    assert media.batch_id == batch.id
    assert event.event_metadata["problem_source"] == "image_ocr"
