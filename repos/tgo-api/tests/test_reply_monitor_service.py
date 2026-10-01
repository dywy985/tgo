from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models import Staff, Ticket
from app.models.reply_monitor import (
    DEFAULT_WEEKLY_SCHEDULE,
    ReplyMonitorBatch,
    ReplyMonitorEvent,
    ReplyMonitorGroupPolicy,
    ReplyMonitorSettings,
    ReplyMonitorGroupCustomer,
)
from app.schemas.reply_monitor import (
    ReplyMonitorCustomerMemberInput,
    ReplyMonitorCustomerRosterUpdate,
    ReplyMonitorEventCreate,
    ReplyMonitorSettingsUpdate,
)
from app.services.reply_monitor_service import (
    _bound_staff_matches_event,
    classify_group_sender,
    dismiss_pending_batch,
    customer_identity_key,
    effective_sender_kind_for_event,
    normalize_member_identity,
    _responsible_staff_id,
    _staff_matches_group_owner_name,
    _unique_staff_by_exact_identity,
    add_working_minutes,
    apply_group_roster_to_unknown_events,
    build_stats,
    next_reminder_for_batch,
    has_problem_escalation_context,
    is_customer_resolution_text,
    quoted_event_matches,
    select_reply_batch,
    select_recent_media_context,
    should_open_problem_batch,
    working_minutes_between,
)
from app.services.reply_monitor_classifier import is_substantive_staff_reply


def test_dismiss_pending_batch_stops_reminders_and_preserves_ticket_link():
    project_id, batch_id, ticket_id = uuid4(), uuid4(), uuid4()
    batch = SimpleNamespace(
        id=batch_id, project_id=project_id, status="pending",
        next_reminder_at=datetime.now(timezone.utc), review_required=True,
        ticket_id=ticket_id,
    )

    class Query:
        def filter(self, *conditions):
            return self

        def with_for_update(self):
            return self

        def first(self):
            return batch if batch.status == "pending" else None

    class Db:
        commits = 0

        def query(self, model):
            assert model is ReplyMonitorBatch
            return Query()

        def commit(self):
            self.commits += 1

    db = Db()
    assert dismiss_pending_batch(db, project_id, batch_id) is True
    assert (batch.status, batch.next_reminder_at, batch.review_required) == ("dismissed", None, False)
    assert batch.ticket_id == ticket_id
    assert db.commits == 1
    assert dismiss_pending_batch(db, project_id, batch_id) is False
    assert db.commits == 1


@pytest.mark.parametrize("content", ["可以了", "已经好了", "没问题了"])
def test_customer_resolution_text_closes_only_clear_confirmations(content):
    assert is_customer_resolution_text(content) is True


@pytest.mark.parametrize("content", ["之前可以了，现在又不行", "可以了吗", "可以吗"])
def test_customer_resolution_text_rejects_questions_and_later_failures(content):
    assert is_customer_resolution_text(content) is False


def test_group_sender_identity_is_unicode_and_whitespace_normalized():
    assert normalize_member_identity("  Ａlice\u3000  Zhang  ") == "alice zhang"


def test_customer_identity_prefers_stable_userid_and_falls_back_to_name():
    assert customer_identity_key(" EXT-001 ", "客户甲", "群A") == "userid:ext-001"
    assert customer_identity_key(None, " 客户甲 ", "群A") == "name:客户甲"


def test_event_contract_accepts_structured_quote_fields():
    payload = ReplyMonitorEventCreate(
        message_id="m-1",
        conversation_key="群A",
        conversation_type="group",
        sender_kind="customer",
        sender_name="客户乙",
        message_type="text",
        content_summary="我这边可以",
        current_content="我这边可以",
        quoted_sender_name="客户甲",
        quoted_content="库存怎么处理",
        quoted_message_type="text",
        occurred_at=datetime.now(timezone.utc),
    )

    assert payload.current_content == "我这边可以"
    assert payload.quoted_sender_name == "客户甲"


def test_batch_model_tracks_customer_and_reply_matching_state():
    columns = ReplyMonitorBatch.__table__.columns
    assert "customer_identity_key" in columns
    assert "reply_actor_kind" in columns
    assert "reply_match_status" in columns
    assert customer_identity_key(None, None, "群A") == "conversation:群a"


def test_reply_quote_selects_only_the_referenced_customer_batch():
    batch_a = SimpleNamespace(id=uuid4())
    batch_b = SimpleNamespace(id=uuid4())
    quoted_event = SimpleNamespace(batch_id=batch_b.id)

    batch, status = select_reply_batch(
        [batch_a, batch_b], [quoted_event], allow_unquoted_single=True
    )

    assert batch is batch_b
    assert status == "matched_quote"


def test_unquoted_reply_with_multiple_customers_stays_ambiguous():
    batches = [SimpleNamespace(id=uuid4()), SimpleNamespace(id=uuid4())]

    batch, status = select_reply_batch(batches, [], allow_unquoted_single=True)

    assert batch is None
    assert status == "ambiguous"


def test_unquoted_internal_reply_matches_one_pending_customer():
    only = SimpleNamespace(id=uuid4())

    batch, status = select_reply_batch([only], [], allow_unquoted_single=True)

    assert batch is only
    assert status == "matched_single"


@pytest.mark.parametrize(
    ("content", "message_type"),
    [
        ("我明天早上看下。", "text"),
        ("@杨晓虎 品种编码提供一下", "text"),
        ("我问下。", "text"),
        ("[图片]", "image"),
        ("安装包", "file"),
    ],
)
def test_observed_staff_replies_are_substantive(content, message_type):
    assert is_substantive_staff_reply(content, message_type) is True


@pytest.mark.parametrize(
    ("content", "message_type"),
    [
        ("@杨晓虎", "text"),
        ("@杨晓虎 @蓝健", "text"),
        ("[其他消息]", "other"),
        ("", "text"),
    ],
)
def test_mentions_and_unreadable_placeholders_do_not_close_unquoted_batch(content, message_type):
    assert is_substantive_staff_reply(content, message_type) is False


def test_quote_matching_uses_structured_sender_and_normalized_current_text():
    event = SimpleNamespace(
        sender_id="EXT-1", sender_name="客户甲", current_content="库存  对不上！",
        content_summary="引用旧内容\n库存  对不上！", normalized_content=None,
    )

    assert quoted_event_matches(event, " ext-1 ", None, "库存对不上") is True
    assert quoted_event_matches(event, "ext-2", None, "库存对不上") is False


def test_configured_group_customer_is_classified_by_stable_userid_first():
    roster = [SimpleNamespace(identity_type="userid", identity_value="ext-001")]

    assert classify_group_sender(
        roster, sender_kind_hint="customer", sender_id="ext-001", sender_name="任意昵称"
    ) == "customer"


def test_group_member_outside_configured_customer_roster_is_a_reply():
    roster = [SimpleNamespace(identity_type="name", identity_value="客户甲")]

    assert classify_group_sender(
        roster, sender_kind_hint="customer", sender_id=None, sender_name="客服乙"
    ) == "staff"


def test_low_level_group_classifier_without_roster_stays_unknown():
    assert classify_group_sender(
        [], sender_kind_hint="customer", sender_id=None, sender_name="新成员"
    ) == "unknown"
    assert classify_group_sender(
        [], sender_kind_hint="staff", sender_id=None, sender_name="手机本人"
    ) == "staff"


def test_customer_roster_contract_deduplicates_normalized_identities():
    payload = ReplyMonitorCustomerRosterUpdate(roster_confirmed=True, customer_members=[
        ReplyMonitorCustomerMemberInput(identity_type="name", identity_value="  Ａlice  ", display_name="Alice"),
        ReplyMonitorCustomerMemberInput(identity_type="name", identity_value="alice", display_name="Alice duplicate"),
        ReplyMonitorCustomerMemberInput(identity_type="userid", identity_value="EXT-1", display_name="Alice"),
    ])

    assert [(item.identity_type, item.identity_value) for item in payload.customer_members] == [
        ("name", "alice"), ("userid", "ext-1")
    ]
    assert ReplyMonitorGroupCustomer.__tablename__ == "api_reply_monitor_group_customers"
    assert ReplyMonitorGroupPolicy.__tablename__ == "api_reply_monitor_group_policies"


def test_customer_roster_can_be_saved_empty_to_remove_all_auto_candidates():
    payload = ReplyMonitorCustomerRosterUpdate(roster_confirmed=True, customer_members=[])
    assert payload.customer_members == []


def test_customer_roster_requires_explicit_complete_confirmation():
    with pytest.raises(ValidationError):
        ReplyMonitorCustomerRosterUpdate(customer_members=[
            ReplyMonitorCustomerMemberInput(
                identity_type="name", identity_value="客户甲", display_name="客户甲"
            )
        ])


class _RosterDb:
    def __init__(self, rows, confirmed=True):
        self.rows = rows
        self.policy = SimpleNamespace(roster_confirmed=confirmed) if confirmed else None

    def query(self, model):
        if model is ReplyMonitorGroupCustomer:
            return _Query(self.rows)
        if model is ReplyMonitorGroupPolicy:
            return _Query([self.policy] if self.policy else [])
        if model is Staff:
            return _Query([])
        raise AssertionError(f"unexpected query model: {model}")


def test_effective_group_sender_is_computed_from_persisted_customer_roster():
    platform = SimpleNamespace(id=uuid4(), project_id=uuid4())
    payload = SimpleNamespace(
        conversation_type="group", conversation_key="group-1",
        sender_kind="customer", sender_id=None, sender_name="客服乙",
    )
    roster = [SimpleNamespace(identity_type="name", identity_value="客户甲")]

    assert effective_sender_kind_for_event(_RosterDb(roster), platform, payload) == "staff"


def test_unconfigured_group_defaults_external_member_to_customer():
    platform = SimpleNamespace(id=uuid4(), project_id=uuid4())
    payload = SimpleNamespace(
        conversation_type="group", conversation_key="group-1",
        sender_kind="customer", sender_id=None, sender_name="客户甲", metadata={},
    )
    roster = [SimpleNamespace(identity_type="name", identity_value="客户甲")]

    assert effective_sender_kind_for_event(
        _RosterDb(roster, confirmed=False), platform, payload
    ) == "customer"


def test_unconfigured_group_without_sender_identity_stays_unknown():
    platform = SimpleNamespace(id=uuid4(), project_id=uuid4())
    payload = SimpleNamespace(
        conversation_type="group", conversation_key="group-1",
        sender_kind="customer", sender_id=None, sender_name=None, metadata={},
    )

    assert effective_sender_kind_for_event(
        _RosterDb([], confirmed=False), platform, payload
    ) == "unknown"


def test_group_owner_is_a_reply_even_without_customer_roster():
    platform = SimpleNamespace(id=uuid4(), project_id=uuid4())
    payload = SimpleNamespace(
        conversation_type="group", conversation_key="group-owner",
        sender_kind="customer", sender_id=None, sender_name="  刘　泓凡 ",
        metadata={"group_owner_name": "刘 泓凡"},
    )

    assert effective_sender_kind_for_event(_RosterDb([]), platform, payload) == "staff"


class _IdentityDb:
    def __init__(self, staff_rows, roster_rows=None):
        self.staff_rows = staff_rows
        self.roster_rows = roster_rows or []

    def query(self, model):
        if model is Staff:
            return _Query(self.staff_rows)
        if model is ReplyMonitorGroupCustomer:
            return _Query(self.roster_rows)
        raise AssertionError(f"unexpected query model: {model}")


def test_configured_internal_staff_overrides_incorrect_private_customer_hint():
    project_id = uuid4()
    platform = SimpleNamespace(id=uuid4(), project_id=project_id)
    staff = SimpleNamespace(
        project_id=project_id, wecom_userid="staff-001", name="内部员工",
        nickname=None, username="internal", is_active=True,
        deleted_at=None, role="admin",
    )
    payload = SimpleNamespace(
        conversation_type="private", conversation_key="private-staff",
        sender_kind="customer", sender_id="staff-001", sender_name="内部员工",
        metadata={},
    )

    assert effective_sender_kind_for_event(
        _IdentityDb([staff]), platform, payload
    ) == "staff"


def test_private_sender_keeps_source_hint_without_group_roster_lookup():
    platform = SimpleNamespace(id=uuid4(), project_id=uuid4())
    payload = SimpleNamespace(
        conversation_type="private", conversation_key="private-1",
        sender_kind="customer", sender_id=None, sender_name="客户甲",
    )

    assert effective_sender_kind_for_event(_RosterDb([]), platform, payload) == "customer"


def test_saving_roster_reclassifies_only_unknown_group_events():
    unknown_customer = SimpleNamespace(
        sender_kind="unknown", sender_id=None, sender_name="客户甲"
    )
    unknown_staff = SimpleNamespace(
        sender_kind="unknown", sender_id=None, sender_name="客服乙"
    )
    existing = SimpleNamespace(
        sender_kind="customer", sender_id=None, sender_name="客户甲"
    )
    roster = [SimpleNamespace(identity_type="name", identity_value="客户甲")]

    changed = apply_group_roster_to_unknown_events(
        [unknown_customer, unknown_staff, existing], roster
    )

    assert changed == [unknown_customer, unknown_staff]
    assert unknown_customer.sender_kind == "customer"
    assert unknown_staff.sender_kind == "staff"
    assert existing.sender_kind == "customer"


def _settings():
    return SimpleNamespace(
        timezone="Asia/Shanghai",
        weekly_schedule=DEFAULT_WEEKLY_SCHEDULE,
    )


def test_working_minutes_skip_night_and_weekend():
    # 2026-09-04 is Friday. 17:50 + 30 service minutes = Monday 09:20.
    start = datetime(2026, 9, 4, 9, 50, tzinfo=timezone.utc)
    due = add_working_minutes(start, 30, _settings())
    assert due == datetime(2026, 9, 7, 1, 20, tzinfo=timezone.utc)
    assert working_minutes_between(start, due, _settings()) == 30


def test_settings_reject_invalid_work_range():
    with pytest.raises(ValidationError):
        ReplyMonitorSettingsUpdate(
            weekly_schedule={"0": [{"start": "18:00", "end": "09:00"}]},
            notification_channels={"in_app": True},
        )


def test_settings_reject_customer_facing_channel():
    with pytest.raises(ValidationError):
        ReplyMonitorSettingsUpdate(
            weekly_schedule=DEFAULT_WEEKLY_SCHEDULE,
            notification_channels={"customer_group": True},
        )


def test_reminder_delivery_can_be_disabled_without_disabling_monitoring():
    settings = ReplyMonitorSettingsUpdate(
        enabled=True,
        reminders_enabled=False,
        weekly_schedule=DEFAULT_WEEKLY_SCHEDULE,
        notification_channels={"in_app": True, "wecom_app": True},
    )

    assert settings.enabled is True
    assert settings.reminders_enabled is False
    assert ReplyMonitorSettings.reminders_enabled.default.arg is True


def test_only_scored_candidates_open_a_new_problem_batch():
    assert should_open_problem_batch({"problem_score": 50, "problem_threshold": 50}) is True
    assert should_open_problem_batch({"problem_score": 49, "problem_threshold": 50}) is False


def test_borderline_problem_opens_only_with_same_customer_recent_context():
    now = datetime(2026, 9, 9, 2, 0, tzinfo=timezone.utc)
    same_customer_image = SimpleNamespace(
        sender_kind="customer", sender_id="ext-1", sender_name="客户甲",
        message_type="image", content_summary="[图片]", event_metadata={},
        occurred_at=now - timedelta(minutes=4), batch_id=None,
    )
    other_customer_image = SimpleNamespace(
        sender_kind="customer", sender_id="ext-2", sender_name="客户乙",
        message_type="image", content_summary="[图片]", event_metadata={},
        occurred_at=now - timedelta(minutes=1), batch_id=None,
    )

    assert has_problem_escalation_context(
        [same_customer_image, other_customer_image], "userid:ext-1", now
    ) is True
    assert should_open_problem_batch(
        {"problem_score": 40, "problem_threshold": 50}, has_context=True
    ) is True
    assert should_open_problem_batch(
        {"problem_score": 40, "problem_threshold": 50}, has_context=False
    ) is False


def test_staff_reply_breaks_borderline_problem_context():
    now = datetime(2026, 9, 9, 2, 0, tzinfo=timezone.utc)
    image = SimpleNamespace(
        sender_kind="customer", sender_id="ext-1", sender_name="客户甲",
        message_type="image", content_summary="[图片]", event_metadata={},
        occurred_at=now - timedelta(minutes=4), batch_id=None,
    )
    staff_reply = SimpleNamespace(
        sender_kind="staff", sender_id="staff-1", sender_name="客服甲",
        message_type="text", content_summary="收到", event_metadata={},
        occurred_at=now - timedelta(minutes=2), batch_id=None,
    )

    assert has_problem_escalation_context(
        [image, staff_reply], "userid:ext-1", now
    ) is False


def test_media_only_event_never_opens_a_problem_even_with_legacy_score():
    assert should_open_problem_batch({
        "problem_score": 50,
        "problem_threshold": 50,
        "media_only": True,
    }) is False


def test_qualifying_text_collects_media_from_previous_two_minutes():
    now = datetime(2026, 9, 4, 6, 0, tzinfo=timezone.utc)
    image = SimpleNamespace(
        sender_kind="customer", message_type="image", content_summary="[图片]",
        occurred_at=now - timedelta(seconds=90), batch_id=None,
    )
    assert select_recent_media_context([image], now) == [image]


def test_media_context_does_not_cross_staff_reply_or_two_minute_window():
    now = datetime(2026, 9, 4, 6, 0, tzinfo=timezone.utc)
    old_image = SimpleNamespace(
        sender_kind="customer", message_type="image", content_summary="[图片]",
        occurred_at=now - timedelta(seconds=121), batch_id=None,
    )
    recent_image = SimpleNamespace(
        sender_kind="customer", message_type="image", content_summary="[图片]",
        occurred_at=now - timedelta(seconds=60), batch_id=None,
    )
    staff_reply = SimpleNamespace(
        sender_kind="staff", message_type="text", content_summary="收到",
        occurred_at=now - timedelta(seconds=30), batch_id=None,
    )
    assert select_recent_media_context([old_image, recent_image, staff_reply], now) == []


def test_missing_or_invalid_score_is_not_a_problem_candidate():
    assert should_open_problem_batch({}) is False
    assert should_open_problem_batch({"problem_score": "bad"}) is False


def test_phone_binding_is_used_only_for_the_bound_accounts_own_message():
    bound_staff = SimpleNamespace(
        wecom_userid="LiuHongFan",
        name="刘泓凡",
        nickname="小刘",
        username="liuhongfan",
    )

    assert _bound_staff_matches_event(
        bound_staff, None, "刘泓凡", {"bound_wecom_userid": "LiuHongFan"}
    ) is True
    assert _bound_staff_matches_event(
        bound_staff, None, "另一位客服", {"bound_wecom_userid": "LiuHongFan"}
    ) is False


def test_unique_configured_display_name_resolves_staff_without_sender_userid():
    chen = SimpleNamespace(
        wecom_userid="ChenHongSen",
        name="陈泓森",
        nickname="CHS",
        username="chenhongsen",
    )

    assert _unique_staff_by_exact_identity([chen], "陈泓森") is chen


def test_duplicate_display_name_does_not_resolve_staff_without_sender_userid():
    rows = [
        SimpleNamespace(wecom_userid="staff-a", name="同名客服", nickname=None, username="a"),
        SimpleNamespace(wecom_userid="staff-b", name="同名客服", nickname=None, username="b"),
    ]

    assert _unique_staff_by_exact_identity(rows, "同名客服") is None


def test_display_name_without_configured_userid_stays_unresolved():
    row = SimpleNamespace(
        wecom_userid=None,
        name="陈泓森",
        nickname="CHS",
        username="chenhongsen",
    )

    assert _unique_staff_by_exact_identity([row], "陈泓森") is None


def test_reenabled_batch_recomputes_the_next_due_time_from_its_sequence():
    settings = SimpleNamespace(
        timezone="Asia/Shanghai",
        weekly_schedule=DEFAULT_WEEKLY_SCHEDULE,
        first_reminder_minutes=30,
        repeat_reminder_minutes=60,
    )
    batch = SimpleNamespace(
        first_customer_at=datetime(2026, 9, 3, 1, 0, tzinfo=timezone.utc),
        reminder_count=1,
    )

    assert next_reminder_for_batch(batch, settings) == datetime(
        2026, 9, 3, 2, 30, tzinfo=timezone.utc
    )


class _Query:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args):
        return self

    def order_by(self, *args):
        return self

    def first(self):
        return self.rows[0] if self.rows else None

    def all(self):
        return self.rows


class _OwnerDb:
    def __init__(self, staff_rows, route_rows=None):
        self.staff_rows = staff_rows
        self.route_rows = route_rows or []

    def query(self, model):
        from app.models import Staff, TicketRoute
        if model is TicketRoute:
            return _Query(self.route_rows)
        if model is Staff:
            return _Query(self.staff_rows)
        return _Query([])


def test_group_owner_exact_name_resolves_responsible_staff_without_route():
    project_id = uuid4()
    owner_id = uuid4()
    staff = SimpleNamespace(id=owner_id, name="刘泓凡", nickname=None, username="liuhongfan")
    platform = SimpleNamespace(project_id=project_id)

    resolved = _responsible_staff_id(
        _OwnerDb([staff]), platform, "group", "外部群-4", {"group_owner_name": "刘泓凡"}
    )

    assert resolved == owner_id


def test_manual_group_override_accepts_cross_platform_rule_and_staff_without_userid():
    project_id = uuid4()
    platform_id = uuid4()
    owner_id = uuid4()
    staff = SimpleNamespace(
        id=owner_id, name="群主甲", nickname=None, username="owner-a",
        wecom_userid=None,
    )
    route = SimpleNamespace(
        id=uuid4(), project_id=project_id, platform_id=None,
        group_key="客户服务群A", visitor_key=None, staff_id=owner_id,
        priority=100, deleted_at=None,
    )
    platform = SimpleNamespace(id=platform_id, project_id=project_id)

    resolved = _responsible_staff_id(
        _OwnerDb([staff], [route]), platform, "group", "客户服务群A", {}
    )

    assert resolved == owner_id


def test_group_owner_name_matches_staff_without_wecom_userid_after_normalization():
    staff = SimpleNamespace(
        id=uuid4(),
        name="刘 泓凡",
        nickname=None,
        username="liuhongfan",
        wecom_userid=None,
    )

    assert _staff_matches_group_owner_name(staff, "  刘　泓凡  ") is True


def test_group_owner_name_with_trailing_mobile_matches_staff():
    staff = SimpleNamespace(
        id=uuid4(),
        name="蓝健",
        nickname=None,
        username="lanjian",
        wecom_userid=None,
    )

    assert _staff_matches_group_owner_name(staff, "蓝健13500000004") is True


def test_ambiguous_group_owner_name_stays_unassigned():
    project_id = uuid4()
    staff_rows = [
        SimpleNamespace(id=uuid4(), name="同名客服", nickname=None, username="staff-a"),
        SimpleNamespace(id=uuid4(), name="同名客服", nickname=None, username="staff-b"),
    ]
    platform = SimpleNamespace(project_id=project_id)

    resolved = _responsible_staff_id(
        _OwnerDb(staff_rows), platform, "group", "同名群", {"group_owner_name": "同名客服"}
    )

    assert resolved is None


class _StatsQuery:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args):
        return self

    def all(self):
        return self.rows


class _StatsDb:
    def __init__(self, batches, events, settings):
        self.batches = batches
        self.events = events
        self.settings = settings

    def get(self, model, key):
        if model is ReplyMonitorSettings:
            return self.settings
        return None

    def query(self, model):
        if model is ReplyMonitorBatch:
            return _StatsQuery(self.batches)
        if model is ReplyMonitorEvent:
            return _StatsQuery(self.events)
        if model is Staff:
            return _StatsQuery([])
        if model is Ticket:
            return _StatsQuery([])
        raise AssertionError(f"unexpected query model: {model}")


def test_stats_message_count_includes_customer_events_without_problem_batch():
    project_id = uuid4()
    group_key = "wt:robot:外部群-4"
    settings = SimpleNamespace(
        timezone="Asia/Shanghai",
        weekly_schedule=DEFAULT_WEEKLY_SCHEDULE,
    )
    batch = SimpleNamespace(
        id=uuid4(),
        conversation_key=group_key,
        conversation_name="外部群-4",
        responsible_staff_id=None,
        status="answered",
        customer_message_count=3,
        first_customer_at=datetime(2026, 9, 2, 12, 28, tzinfo=timezone.utc),
        first_reply_at=datetime(2026, 9, 2, 12, 30, tzinfo=timezone.utc),
    )
    events = [
        SimpleNamespace(
            batch_id=None,
            conversation_key=group_key,
            conversation_name="外部群-4",
            resolved_staff_id=None,
            event_metadata={},
            occurred_at=datetime(2026, 9, 2, 12, 28 + index, tzinfo=timezone.utc),
        )
        for index in range(5)
    ]

    result = build_stats(
        _StatsDb([batch], events, settings),
        project_id,
        date(2026, 9, 2),
        date(2026, 9, 2),
    )

    assert result["summary"]["batch_count"] == 1
    assert result["summary"]["customer_message_count"] == 5
    assert result["daily"][0]["customer_message_count"] == 5
    assert result["group_breakdown"][0]["customer_message_count"] == 5


def test_stats_include_calendar_working_sla_ticket_and_actual_responder_metrics():
    project_id = uuid4()
    owner_id = uuid4()
    responder_id = uuid4()
    settings = SimpleNamespace(
        timezone="Asia/Shanghai",
        weekly_schedule=DEFAULT_WEEKLY_SCHEDULE,
        first_reminder_minutes=30,
    )
    batches = [
        SimpleNamespace(
            id=uuid4(), conversation_key="group-a", conversation_name="内部测试",
            responsible_staff_id=owner_id, actual_reply_staff_id=responder_id,
            status="answered", customer_message_count=1, reminder_count=1,
            ticket_id=uuid4(), first_customer_at=datetime(2026, 9, 4, 9, 50, tzinfo=timezone.utc),
            first_reply_at=datetime(2026, 9, 7, 1, 20, tzinfo=timezone.utc),
        ),
        SimpleNamespace(
            id=uuid4(), conversation_key="group-a", conversation_name="内部测试",
            responsible_staff_id=owner_id, actual_reply_staff_id=owner_id,
            status="answered", customer_message_count=1, reminder_count=0,
            ticket_id=None, first_customer_at=datetime(2026, 9, 2, 1, 0, tzinfo=timezone.utc),
            first_reply_at=datetime(2026, 9, 2, 1, 10, tzinfo=timezone.utc),
        ),
    ]
    events = [
        SimpleNamespace(
            batch_id=b.id, conversation_key=b.conversation_key,
            conversation_name=b.conversation_name, resolved_staff_id=None,
            event_metadata={}, occurred_at=b.first_customer_at,
        ) for b in batches
    ]

    result = build_stats(
        _StatsDb(batches, events, settings), project_id,
        date(2026, 9, 1), date(2026, 9, 8),
    )

    summary = result["summary"]
    assert summary["avg_calendar_first_response_minutes"] == 1910
    assert summary["avg_working_first_response_minutes"] == 20
    assert summary["max_working_first_response_minutes"] == 30
    assert summary["within_sla_count"] == 2
    assert summary["within_sla_rate"] == 100
    assert summary["avg_reminder_count"] == 0.5
    assert summary["auto_ticket_count"] == 1

    owner = next(row for row in result["staff_breakdown"] if row["staff_id"] == str(owner_id))
    responder = next(row for row in result["staff_breakdown"] if row["staff_id"] == str(responder_id))
    assert owner["assigned_questions"] == 2
    assert owner["actual_replies"] == 1
    assert responder["actual_replies"] == 1
    assert responder["cross_assist_count"] == 1


def test_unassigned_answer_is_not_counted_as_cross_staff_assistance():
    project_id = uuid4()
    responder_id = uuid4()
    settings = SimpleNamespace(
        timezone="Asia/Shanghai", weekly_schedule=DEFAULT_WEEKLY_SCHEDULE,
        first_reminder_minutes=30,
    )
    batch = SimpleNamespace(
        id=uuid4(), conversation_key="group-a", conversation_name="内部测试",
        responsible_staff_id=None, actual_reply_staff_id=responder_id,
        status="answered", customer_message_count=1, reminder_count=0,
        ticket_id=None, first_customer_at=datetime(2026, 9, 2, 1, 0, tzinfo=timezone.utc),
        first_reply_at=datetime(2026, 9, 2, 1, 5, tzinfo=timezone.utc),
    )
    event = SimpleNamespace(
        batch_id=batch.id, conversation_key="group-a", conversation_name="内部测试",
        resolved_staff_id=None, event_metadata={}, occurred_at=batch.first_customer_at,
    )

    result = build_stats(
        _StatsDb([batch], [event], settings), project_id,
        date(2026, 9, 2), date(2026, 9, 2),
    )

    row = next(item for item in result["staff_breakdown"] if item["staff_id"] == str(responder_id))
    assert row["cross_assist_count"] == 0


def test_supplemental_message_is_attributed_to_problem_first_day():
    project_id = uuid4()
    settings = SimpleNamespace(
        timezone="Asia/Shanghai", weekly_schedule=DEFAULT_WEEKLY_SCHEDULE,
        first_reminder_minutes=30,
    )
    batch = SimpleNamespace(
        id=uuid4(), conversation_key="group-a", conversation_name="内部测试",
        responsible_staff_id=None, actual_reply_staff_id=None, status="pending",
        customer_message_count=2, reminder_count=0, ticket_id=None,
        first_customer_at=datetime(2026, 9, 2, 1, 0, tzinfo=timezone.utc),
        first_reply_at=None,
    )
    supplement = SimpleNamespace(
        batch_id=batch.id, conversation_key="group-a", conversation_name="内部测试",
        resolved_staff_id=None, event_metadata={},
        occurred_at=datetime(2026, 9, 3, 1, 0, tzinfo=timezone.utc),
    )

    result = build_stats(
        _StatsDb([batch], [supplement], settings), project_id,
        date(2026, 9, 2), date(2026, 9, 2),
    )

    assert len(result["daily"]) == 1
    assert result["daily"][0]["date"] == "2026-09-02"
    assert result["daily"][0]["customer_message_count"] == 1
