"""ticket_autofill_service 单元测试（stub DB，不连 PostgreSQL）."""
import sys
from datetime import datetime
from types import SimpleNamespace

sys.path.insert(0, r"C:\陈泓森的\项目\人工智能客服\企业微信智能客服系统v2.0\tgo\repos\tgo-api")

from app.services.ticket_autofill_service import (
    build_ticket_fields,
    resolve_autofill,
    sla_minutes_for,
)
from app.models.ticket import TicketSettings, DEFAULT_TICKET_FORM_SCHEMA


class StubDB:
    """极简 DB stub：query(model).filter(...).first() 返回预设对象."""

    def __init__(self, settings=None, visitor=None, session=None, platform=None, last_ticket=None):
        self._settings = settings
        self._visitor = visitor
        self._session = session
        self._platform = platform
        self._last_ticket = last_ticket

    def query(self, model):
        return _QueryStub(self, model)


class _QueryStub:
    def __init__(self, db, model):
        self._db = db
        self._model = model

    def filter(self, *a, **k):
        return self

    def order_by(self, *a, **k):
        return self

    def first(self):
        name = self._model.__name__
        if name == "TicketSettings":
            return self._db._settings
        if name == "Visitor":
            return self._db._visitor
        if name == "VisitorSession":
            return self._db._session
        if name == "Platform":
            return self._db._platform
        if name == "Ticket":
            return self._db._last_ticket
        return None


def fake_visitor(**kw):
    defaults = dict(
        id="v1", name="张三", nickname="zhangsan", phone_number="13800138000",
        email="z@x.com", company="测试公司", job_title="经理",
        custom_attributes={"order_no": "SO-2026-001", "vip": True},
    )
    defaults.update(kw)
    return SimpleNamespace(**defaults)


def fake_session(**kw):
    defaults = dict(id="s1", created_at=datetime(2026, 8, 28, 10, 0), message_count=12, status="open", duration_seconds=300)
    defaults.update(kw)
    return SimpleNamespace(**defaults)


def fake_platform(**kw):
    defaults = dict(id="p1", type="wecom_bot", name="企微测试群")
    defaults.update(kw)
    return SimpleNamespace(**defaults)


def fake_settings(**kw):
    s = TicketSettings(project_id="proj1", sla_timeout_minutes=15)
    for k, v in kw.items():
        setattr(s, k, v)
    return s


# ---------------------------------------------------------------------------
# resolve_autofill 规则引擎
# ---------------------------------------------------------------------------

def test_resolve_const():
    assert resolve_autofill("const:其他") == "其他"


def test_resolve_visitor_field():
    v = fake_visitor()
    assert resolve_autofill("visitor.phone_number", visitor=v) == "13800138000"


def test_resolve_visitor_custom_attr():
    v = fake_visitor()
    assert resolve_autofill("visitor.custom_attributes.order_no", visitor=v) == "SO-2026-001"
    assert resolve_autofill("visitor.custom_attributes.nope", visitor=v) is None


def test_resolve_session_and_platform():
    assert resolve_autofill("session.created_at", session=fake_session()) == "2026-08-28T10:00:00"
    assert resolve_autofill("platform.type", platform=fake_platform()) == "wecom_bot"


def test_resolve_ai_fields_placeholder():
    assert resolve_autofill("ai_fields.title") == ("__ai_fields__", "title")


def test_resolve_unknown_source():
    assert resolve_autofill("bogus.xxx") is None


# ---------------------------------------------------------------------------
# build_ticket_fields 组装
# ---------------------------------------------------------------------------

def test_ai_fields_win_over_rules():
    db = StubDB(settings=fake_settings(), visitor=fake_visitor(), session=fake_session(), platform=fake_platform())
    out = build_ticket_fields(
        db, project_id="proj1", visitor_id="v1", session_id="s1", platform_id="p1",
        ai_fields={"title": "AI提取标题", "category": "K6客服", "priority": "high"},
    )
    assert out["title"] == "AI提取标题"
    assert out["category"] == "K6客服"
    assert out["priority"] == "high"
    assert "description" not in out
    assert out["ai_summary"]["autofill"]["title"]["source"] == "ai_fields"
    assert out["_ai_strong"]["category"] == "K6客服"


def test_fallback_when_no_ai_fields():
    db = StubDB(settings=fake_settings(), visitor=fake_visitor())
    out = build_ticket_fields(db, project_id="proj1", visitor_id="v1", ai_fields=None)
    assert out["category"] == "其他"  # fallback
    assert out["priority"] == "normal"  # fallback
    assert "title" not in out  # 无 fallback


def test_custom_fields_autofill():
    custom_schema = DEFAULT_TICKET_FORM_SCHEMA + [
        {"key": "order_no", "label": "订单号", "type": "text", "auto_fill": {"source": "visitor.custom_attributes.order_no"}},
        {"key": "phone", "label": "手机号", "type": "text", "auto_fill": {"source": "visitor.phone_number"}},
        {"key": "vip", "label": "VIP", "type": "boolean", "auto_fill": {"source": "visitor.custom_attributes.vip"}},
    ]
    db = StubDB(settings=fake_settings(form_schema=custom_schema), visitor=fake_visitor())
    out = build_ticket_fields(db, project_id="proj1", visitor_id="v1")
    assert out["custom_fields"]["order_no"] == "SO-2026-001"
    assert out["custom_fields"]["phone"] == "13800138000"
    assert out["custom_fields"]["vip"] is True


def test_ai_custom_fields_override_but_none_skipped():
    custom_schema = DEFAULT_TICKET_FORM_SCHEMA + [
        {"key": "order_no", "label": "订单号", "type": "text", "auto_fill": {"source": "visitor.custom_attributes.order_no"}},
        {"key": "phone", "label": "手机号", "type": "text", "auto_fill": {"source": "visitor.phone_number"}},
    ]
    db = StubDB(settings=fake_settings(form_schema=custom_schema), visitor=fake_visitor())
    out = build_ticket_fields(
        db, project_id="proj1", visitor_id="v1",
        ai_fields={"custom_fields": {"order_no": "AI-999", "phone": None}},
    )
    assert out["custom_fields"]["order_no"] == "AI-999"
    assert out["custom_fields"]["phone"] == "13800138000"  # None 不覆盖规则值


def test_last_ticket_respects_flag_and_schema():
    lt_schema = [f for f in DEFAULT_TICKET_FORM_SCHEMA if f["key"] != "category"] + [
        {"key": "category", "label": "分类", "type": "select", "auto_fill": {"source": "last_ticket.category", "fallback": "其他"}},
    ]
    db = StubDB(
        settings=fake_settings(form_schema=lt_schema), visitor=fake_visitor(),
        last_ticket=SimpleNamespace(category="K8客服", custom_fields={"order_no": "OLD-1"}),
    )
    off = build_ticket_fields(db, project_id="proj1", visitor_id="v1", last_ticket_enabled=False)
    assert off["category"] == "其他"  # 默认关闭 → fallback
    on = build_ticket_fields(db, project_id="proj1", visitor_id="v1", last_ticket_enabled=True)
    assert on["category"] == "K8客服"  # 开启 → 上次工单值


# ---------------------------------------------------------------------------
# sla_minutes_for 分级
# ---------------------------------------------------------------------------

def test_sla_by_priority():
    db = StubDB(settings=fake_settings(sla_timeout_minutes=15, sla_by_priority={"urgent": 10, "high": 45}))
    assert sla_minutes_for(db, "proj1", "urgent") == 10
    assert sla_minutes_for(db, "proj1", "high") == 45
    assert sla_minutes_for(db, "proj1", "normal") == 15  # 回退单一值
    assert sla_minutes_for(db, "proj1", "low") == 1440  # 缺省值


def test_sla_fallback_without_config():
    db = StubDB(settings=fake_settings(sla_timeout_minutes=30))
    assert sla_minutes_for(db, "proj1", "urgent") == 30
