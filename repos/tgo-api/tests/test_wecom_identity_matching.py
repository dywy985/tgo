from types import SimpleNamespace
from uuid import uuid4

from datetime import datetime, timezone

from app.models import Staff, WeComDiscoveredIdentity
from app.services.wecom_identity_service import find_unique_staff_match, normalize_identity, reconcile_identity


def staff(*, name=None, nickname=None, username="user"):
    return SimpleNamespace(id=uuid4(), name=name, nickname=nickname, username=username)


def test_normalization_handles_case_full_width_and_whitespace():
    assert normalize_identity("  Ｚｈａｎｇ　Ｓａｎ  ") == "zhangsan"


def test_unique_exact_match_reports_matching_field():
    target = staff(name="张 三", nickname="小张", username="zhang")
    matched, field, candidates = find_unique_staff_match("张三", [target], ["name", "nickname", "username"])
    assert matched is target
    assert field == "name"
    assert candidates[0]["staff_id"] == str(target.id)


def test_duplicate_normalized_names_are_ambiguous():
    first = staff(name="Alice", username="alice-1")
    second = staff(nickname="ＡＬＩＣＥ", username="alice-2")
    matched, field, candidates = find_unique_staff_match(" alice ", [first, second], ["name", "nickname"])
    assert matched is None
    assert field is None
    assert len(candidates) == 2


def test_disabled_field_does_not_participate():
    target = staff(name="王五", username="wangwu")
    matched, _, candidates = find_unique_staff_match("王五", [target], ["username"])
    assert matched is None
    assert candidates == []


def test_missing_display_name_never_matches():
    matched, field, candidates = find_unique_staff_match(None, [staff(username="none")], ["username"])
    assert (matched, field, candidates) == (None, None, [])


class FakeQuery:
    def __init__(self, all_rows=None, first_row=None):
        self.all_rows = all_rows or []
        self.first_row = first_row
    def filter(self, *_args): return self
    def all(self): return self.all_rows
    def first(self): return self.first_row


class FakeDB:
    def __init__(self, staff_rows, occupied=None, old_identity=None):
        self.staff_rows = staff_rows; self.occupied = occupied; self.old_identity = old_identity
        self.staff_queries = 0; self.added = []
    def query(self, model):
        if model is Staff:
            self.staff_queries += 1
            return FakeQuery(all_rows=self.staff_rows) if self.staff_queries == 1 else FakeQuery(first_row=self.occupied)
        if model is WeComDiscoveredIdentity:
            return FakeQuery(first_row=self.old_identity)
        raise AssertionError(model)
    def add(self, row): self.added.append(row)
    def get(self, model, row_id):
        if model is Staff:
            return next((row for row in self.staff_rows if row.id == row_id), None)
        return None


def identity(**overrides):
    values = dict(id=uuid4(), userid="new-id", normalized_userid="new-id", display_name="张三",
                  normalized_display_name="张三", status="unmatched", bound_staff_id=None,
                  match_field=None, match_reason=None, match_candidates=[], last_attempt_at=None, bound_at=None,
                  last_seen=datetime.now(timezone.utc))
    values.update(overrides)
    return SimpleNamespace(**values)


def settings(**overrides):
    values = dict(auto_bind_enabled=True, match_fields=["name", "nickname", "username"], existing_binding_policy="replace")
    values.update(overrides)
    return SimpleNamespace(**values)


def platform():
    return SimpleNamespace(id=uuid4(), project_id=uuid4(), connection_version=3)


def test_unique_match_replaces_old_userid_and_audits():
    target = staff(name="张三", username="zhang"); target.project_id = uuid4(); target.wecom_userid = "old-id"
    old = identity(userid="old-id", status="auto_bound", bound_staff_id=target.id)
    discovered = identity()
    db = FakeDB([target], old_identity=old)
    reconcile_identity(db, platform(), discovered, settings())
    assert target.wecom_userid == "new-id"
    assert discovered.status == "auto_bound"
    assert old.status == "superseded"
    assert any(row.action == "wecom_identity_replaced" for row in db.added)


def test_occupied_userid_is_never_stolen():
    target = staff(name="张三"); target.wecom_userid = None
    occupied = staff(name="李四"); occupied.wecom_userid = "new-id"
    discovered = identity()
    reconcile_identity(FakeDB([target], occupied=occupied), platform(), discovered, settings())
    assert discovered.status == "conflict"
    assert target.wecom_userid is None


def test_ignored_and_disabled_records_do_not_bind():
    target = staff(name="张三"); target.wecom_userid = None
    ignored = identity(status="ignored")
    reconcile_identity(FakeDB([target]), platform(), ignored, settings())
    assert ignored.status == "ignored" and target.wecom_userid is None
    disabled = identity()
    reconcile_identity(FakeDB([target]), platform(), disabled, settings(auto_bind_enabled=False))
    assert disabled.status == "unmatched" and target.wecom_userid is None


def test_manual_correction_is_sticky_during_later_syncs():
    target = staff(name="与企微名不同"); target.wecom_userid = "new-id"
    discovered = identity(status="manual_bound", bound_staff_id=target.id)
    reconcile_identity(FakeDB([target]), platform(), discovered, settings())
    assert discovered.status == "manual_bound"
    assert discovered.match_reason == "管理员人工绑定，自动匹配不覆盖"
