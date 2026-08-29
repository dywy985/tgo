"""ticket_service（generate_ticket_number / create_ticket）单元测试（stub DB）."""
import sys
from datetime import datetime, timedelta
from types import SimpleNamespace

sys.path.insert(0, r"C:\陈泓森的\项目\人工智能客服\企业微信智能客服系统v2.0\tgo\repos\tgo-api")

from app.services.ticket_service import generate_ticket_number, create_ticket


class StubDB:
    def __init__(self, existing=None, commit_log=None):
        self._existing = existing or []  # [(number,)]
        self._added = []
        self._commit_log = commit_log if commit_log is not None else []

    def query(self, obj):
        return _Q(self, obj)

    def add(self, obj):
        self._added.append(obj)

    def commit(self):
        self._commit_log.append("commit")

    def refresh(self, obj):
        pass


class _Q:
    """模拟 SQLAlchemy query：query(Ticket.number) 返回已有号；query(Ticket.id) 视为冲突检查返回 None."""

    def __init__(self, db, target):
        self._db = db
        self._target = target

    def filter(self, *a, **k):
        return self

    def order_by(self, *a, **k):
        return self

    def first(self):
        key = getattr(self._target, "key", None)
        if key == "id":
            return None  # 冲突检查：不存在
        return self._db._existing[-1] if self._db._existing else None


class TicketSettingsLike:
    def __init__(self):
        self.sla_timeout_minutes = 15
        self.sla_by_priority = {"urgent": 10, "high": 45, "normal": 15, "low": 1440}

    @property
    def sla_by_priority_dict(self):
        return self.sla_by_priority

    @property
    def form_schema_list(self):
        from app.models.ticket import DEFAULT_TICKET_FORM_SCHEMA

        return DEFAULT_TICKET_FORM_SCHEMA


class SettingsQ:
    def __init__(self, settings):
        self._s = settings

    def filter(self, *a, **k):
        return self

    def first(self):
        return self._s


class FullDB(StubDB):
    def __init__(self, existing=None):
        super().__init__(existing)
        self._settings = TicketSettingsLike()
        self._visitor = SimpleNamespace(
            id="v1", name="张三", phone_number="138", custom_attributes={}, deleted_at=None,
            display_name="张三",
        )

    def query(self, obj):
        name = getattr(obj, "__name__", None)
        if name == "TicketSettings":
            return SettingsQ(self._settings)
        return _Q(self, obj)


# ---------------------------------------------------------------------------
# generate_ticket_number 格式
# ---------------------------------------------------------------------------

def test_default_format():
    today = datetime.utcnow().strftime("%Y%m%d")
    db = StubDB(existing=[(f"TK-{today}-0001",)])
    assert generate_ticket_number(db, "proj1") == f"TK-{today}-0002"


def test_empty_db_starts_at_0001():
    db = StubDB(existing=[])
    n = generate_ticket_number(db, "proj1")
    assert n.endswith("-0001")


def test_no_date_format():
    db = StubDB(existing=[("GD-0007",)])
    assert generate_ticket_number(db, "proj1", {"prefix": "GD-", "date": False, "seq_digits": 4}) == "GD-0008"


def test_custom_seq_digits():
    db = StubDB(existing=[("T-42",)])
    assert generate_ticket_number(db, "proj1", {"prefix": "T-", "date": False, "seq_digits": 2}) == "T-43"


def test_prefix_with_dash():
    db = StubDB(existing=[("TK-2026-08-28-099",)])
    n = generate_ticket_number(db, "proj1", {"prefix": "TK-2026-08-28-", "date": False, "seq_digits": 3})
    assert n == "TK-2026-08-28-100"


# ---------------------------------------------------------------------------
# create_ticket 全链路（含 SLA 分级 / 自动填写合并）
# ---------------------------------------------------------------------------

def test_create_ticket_with_autofill_and_sla():
    today = datetime.utcnow().strftime("%Y%m%d")
    db = FullDB()
    t = create_ticket(
        db,
        project_id="proj1",
        title="测试单",
        description="描述",
        priority="high",
        source="manual_service",
        status="pending_human",
        visitor_id="v1",
        ai_fields={"category": "K6客服"},
    )
    assert t.number.startswith(f"TK-{today}-")
    assert t.category == "K6客服"  # ai_fields 生效
    assert t.priority == "high"  # 显式参数不被 fallback 覆盖
    assert t.custom_fields is None
    # SLA 按 high=45min
    assert t.sla_due_at is not None
    assert abs((t.sla_due_at - t.created_at).total_seconds() - 2700) < 5
    # autofill 审计
    assert t.ai_summary["autofill"]["category"]["source"] == "ai_fields"


def test_create_ticket_ai_description_wins():
    db = FullDB()
    t = create_ticket(
        db,
        project_id="proj1",
        title="负面情绪：张三",
        description="AI 检测到负面情绪",
        category="其他",
        priority="high",
        source="ai_auto",
        visitor_id="v1",
        ai_fields={"description": "AI 检测到访客负面情绪（satisfaction=1）", "priority": "high"},
    )
    assert t.description == "AI 检测到访客负面情绪（satisfaction=1）"
    assert t.priority == "high"
