from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from app.models import TicketSource
from app.schemas.ticket import TicketCreate
from app.services.reply_monitor_ticket_service import (
    build_monitor_ticket_description,
    build_monitor_ticket_title,
    is_monitor_ticket_candidate,
    ensure_reply_monitor_ticket,
    transition_monitor_ticket_to_replied,
)
from app.services import reply_monitor_ticket_service as ticket_service


def _event(content, minute=0, kind="customer", message_type="text"):
    return SimpleNamespace(
        content_summary=content,
        occurred_at=datetime(2026, 9, 2, 1, minute, tzinfo=timezone.utc),
        sender_name="客户甲" if kind == "customer" else "客服乙",
        sender_kind=kind,
        message_type=message_type,
    )


def test_reply_monitor_is_a_valid_ticket_source():
    assert TicketSource.REPLY_MONITOR.value == "reply_monitor"
    assert TicketCreate(title="问题", description="原文", source="reply_monitor").source == "reply_monitor"


def test_monitor_ticket_uses_first_question_and_full_customer_timeline_without_ai():
    batch = SimpleNamespace(conversation_name="内部测试", conversation_key="group-a")
    events = [_event("系统登录不进去"), _event("截图如下", 1, message_type="image")]

    assert build_monitor_ticket_title(batch, events) == "系统登录不进去"
    description = build_monitor_ticket_description(batch, events, "Asia/Shanghai")
    assert "问题与回复时间线" in description
    assert "客户问题" in description
    assert "2026-09-02 09:00" in description
    assert "客户甲" in description
    assert "[image] 截图如下" in description


def test_monitor_ticket_title_skips_a_leading_image_placeholder():
    batch = SimpleNamespace(conversation_name="内部测试", conversation_key="group-a")
    events = [_event("[图片]", message_type="image"), _event("系统登录不进去", 1)]

    assert build_monitor_ticket_title(batch, events) == "系统登录不进去"


def test_ticket_candidate_is_immutable_on_the_batch():
    assert is_monitor_ticket_candidate(SimpleNamespace(is_problem_candidate=True)) is True
    assert is_monitor_ticket_candidate(SimpleNamespace(is_problem_candidate=False)) is False
    assert is_monitor_ticket_candidate(SimpleNamespace()) is False


class _Db:
    def __init__(self, ticket):
        self.ticket = ticket
        self.added = []

    def get(self, model, key):
        return self.ticket if key == self.ticket.id else None

    def add(self, value):
        self.added.append(value)


def test_first_human_reply_archives_pending_monitor_ticket_without_future_reminders():
    ticket_id = uuid4()
    ticket = SimpleNamespace(
        id=ticket_id, project_id=uuid4(), status="pending_reply",
        first_response_at=None, replied_at=None, archived_at=None, updated_at=None,
    )
    batch = SimpleNamespace(ticket_id=ticket_id)
    staff = SimpleNamespace(id=uuid4())
    replied_at = datetime(2026, 9, 2, 2, 0, tzinfo=timezone.utc)
    db = _Db(ticket)

    changed = transition_monitor_ticket_to_replied(db, batch, staff, replied_at)

    assert changed is True
    assert ticket.status == "archived"
    assert ticket.first_response_at == replied_at.replace(tzinfo=None)
    assert ticket.replied_at == replied_at.replace(tzinfo=None)
    assert ticket.archived_at == replied_at.replace(tzinfo=None)
    assert db.added[0].from_status == "pending_reply"
    assert db.added[0].to_status == "replied"
    assert db.added[1].from_status == "replied"
    assert db.added[1].to_status == "archived"


def test_terminal_monitor_ticket_is_not_reopened_by_reply():
    ticket_id = uuid4()
    ticket = SimpleNamespace(id=ticket_id, project_id=uuid4(), status="archived")
    db = _Db(ticket)

    assert transition_monitor_ticket_to_replied(
        db, SimpleNamespace(ticket_id=ticket_id), SimpleNamespace(id=uuid4()),
        datetime(2026, 9, 2, 2, 0, tzinfo=timezone.utc),
    ) is False
    assert db.added == []


class _TicketQuery:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args):
        return self

    def order_by(self, *args):
        return self

    def all(self):
        return self.rows

    def first(self):
        return self.rows[0] if self.rows else None


class _TicketDb:
    def __init__(self, events):
        self.events = events
        self.added = []
        self.commits = 0
        self.ticket = None

    def query(self, model):
        from app.models import Visitor
        from app.models.reply_monitor import ReplyMonitorEvent
        if model is ReplyMonitorEvent:
            return _TicketQuery(self.events)
        if model is Visitor:
            return _TicketQuery([])
        return _TicketQuery([])

    def get(self, model, key):
        return self.ticket if self.ticket and self.ticket.id == key else None

    def add(self, value):
        self.added.append(value)

    def flush(self):
        return None

    def commit(self):
        self.commits += 1

    def refresh(self, value):
        return None


def test_ensure_monitor_ticket_is_idempotent_and_commits_before_notification(monkeypatch):
    event = _event("系统登录不进去")
    event.event_metadata = {"problem_score": 70, "problem_threshold": 50}
    db = _TicketDb([event])
    batch = SimpleNamespace(
        id=uuid4(), ticket_id=None, project_id=uuid4(), platform_id=uuid4(),
        conversation_name="内部测试", conversation_key="group-a",
        channel_open_id=None, responsible_staff_id=uuid4(),
        is_problem_candidate=True,
    )
    ticket = SimpleNamespace(id=uuid4(), number="TK-20260903-0001")

    def fake_create_ticket(*args, **kwargs):
        assert kwargs["source"] == "reply_monitor"
        assert kwargs["status"] == "pending_reply"
        assert kwargs["commit"] is False
        db.ticket = ticket
        return ticket

    monkeypatch.setattr(
        "app.services.reply_monitor_ticket_service.create_ticket", fake_create_ticket
    )

    created, was_created = ensure_reply_monitor_ticket(db, batch, "Asia/Shanghai")
    same, created_again = ensure_reply_monitor_ticket(db, batch, "Asia/Shanghai")

    assert created is ticket and same is ticket
    assert was_created is True and created_again is False
    assert batch.ticket_id == ticket.id
    assert db.commits == 1


def test_answered_batch_creates_archived_test_ticket_with_question_and_reply(monkeypatch):
    handler = getattr(ticket_service, "ensure_answered_reply_monitor_ticket", None)
    assert handler is not None, "客服回复时必须存在创建识别测试工单的入口"

    customer = _event("系统登录不进去")
    staff_reply = _event("请清理缓存后重新登录", minute=2, kind="staff")
    for event in (customer, staff_reply):
        event.event_metadata = {}
    db = _TicketDb([customer, staff_reply])
    batch = SimpleNamespace(
        id=uuid4(), ticket_id=None, project_id=uuid4(), platform_id=uuid4(),
        conversation_name="内部测试", conversation_key="group-a",
        channel_open_id=None, responsible_staff_id=uuid4(),
        is_problem_candidate=True,
    )
    ticket = SimpleNamespace(
        id=uuid4(), number="TK-20260908-0002", project_id=batch.project_id,
        status="pending_reply", first_response_at=None, replied_at=None,
        archived_at=None, updated_at=None, description="",
    )

    def fake_create_ticket(*args, **kwargs):
        ticket.description = kwargs["description"]
        db.ticket = ticket
        return ticket

    monkeypatch.setattr(
        "app.services.reply_monitor_ticket_service.create_ticket", fake_create_ticket
    )

    result, created = handler(
        db, batch, SimpleNamespace(id=uuid4()),
        datetime(2026, 9, 2, 1, 2, tzinfo=timezone.utc),
        "Asia/Shanghai",
    )

    assert result is ticket
    assert created is True
    assert ticket.status == "archived"
    assert ticket.archived_at == datetime(2026, 9, 2, 1, 2)
    assert "客户问题" in ticket.description
    assert "系统登录不进去" in ticket.description
    assert "客服回复" in ticket.description
    assert "请清理缓存后重新登录" in ticket.description
    assert db.commits == 0
