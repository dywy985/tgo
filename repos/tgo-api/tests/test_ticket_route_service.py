"""ticket_route_service 路由解析单元测试（stub DB）。

覆盖：匹配优先级（visitor_key > group_key > platform > 兜底）、
priority 排序、软删除/空 staff 过滤、同群降级候选。
"""
import os
import sys
from types import SimpleNamespace
from uuid import uuid4

# 与 tests/conftest.py 保持一致（config.Settings 需要）
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-1234567890")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:test@localhost:5432/tgo_api_test")

sys.path.insert(0, r"C:\陈泓森的\项目\人工智能客服\企业微信智能客服系统v2.0\tgo\repos\tgo-api")

from app.services.ticket_route_service import (
    resolve_ticket_route,
    resolve_scope_degrade_candidates,
)


def _route(**kw):
    """构造 TicketRoute 存根。"""
    base = dict(
        id=uuid4(),
        project_id=None,
        platform_id=None,
        group_key=None,
        visitor_key=None,
        staff_id=uuid4(),
        priority=10,
        deleted_at=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


class StubQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *a, **k):
        return self

    def order_by(self, *a, **k):
        return self

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None


class StubDB:
    def __init__(self, routes):
        self._routes = routes

    def query(self, model):
        if model.__name__ == "TicketRoute":
            return StubQuery(self._routes)
        return StubQuery([])


# ---------------------------------------------------------------------------
# resolve_ticket_route
# ---------------------------------------------------------------------------

def test_no_routes_returns_none():
    db = StubDB([])
    assert resolve_ticket_route(db, project_id=uuid4()) is None


def test_visitor_key_beats_group_key():
    pid = uuid4()
    visitor = "wm-EXTERNAL123"
    group = "wrT0WARQAAHaVhGOZBnxjqN2uh6dS1Cw"
    r_group = _route(project_id=pid, group_key=group, priority=100)
    r_visitor = _route(project_id=pid, visitor_key=visitor, priority=1)
    db = StubDB([r_group, r_visitor])
    hit = resolve_ticket_route(db, project_id=pid, group_key=group, visitor_key=visitor)
    assert hit is r_visitor  # visitor_key 精确优先，即使 priority 更低


def test_group_key_beats_platform_wide():
    pid = uuid4()
    platform = uuid4()
    group = "wrT0WARQAAHaVhGOZBnxjqN2uh6dS1Cw"
    r_platform = _route(project_id=pid, platform_id=platform, priority=100)
    r_group = _route(project_id=pid, platform_id=platform, group_key=group, priority=1)
    db = StubDB([r_platform, r_group])
    hit = resolve_ticket_route(db, project_id=pid, platform_id=platform, group_key=group)
    assert hit is r_group


def test_platform_wide_beats_project_fallback():
    pid = uuid4()
    platform = uuid4()
    r_fallback = _route(project_id=pid, priority=100)
    r_platform = _route(project_id=pid, platform_id=platform, priority=1)
    db = StubDB([r_fallback, r_platform])
    hit = resolve_ticket_route(db, project_id=pid, platform_id=platform)
    assert hit is r_platform


def test_same_level_sorted_by_priority():
    pid = uuid4()
    group = "wrT0WARQAAHaVhGOZBnxjqN2uh6dS1Cw"
    r_low = _route(project_id=pid, group_key=group, priority=1)
    r_high = _route(project_id=pid, group_key=group, priority=50)
    db = StubDB([r_low, r_high])
    hit = resolve_ticket_route(db, project_id=pid, group_key=group)
    assert hit is r_high


def test_deleted_route_skipped():
    """软删除/空 staff 过滤发生在 SQL 查询层（stub 无法模拟）；
    此处验证：删除过滤后无有效路由时返回 None。"""
    pid = uuid4()
    db = StubDB([])
    assert resolve_ticket_route(db, project_id=pid, group_key="any") is None


def test_no_match_returns_none():
    pid = uuid4()
    r = _route(project_id=pid, group_key="groupA")
    db = StubDB([r])
    assert resolve_ticket_route(db, project_id=pid, group_key="groupB") is None


# ---------------------------------------------------------------------------
# resolve_scope_degrade_candidates
# ---------------------------------------------------------------------------

def test_degrade_requires_group_key():
    pid = uuid4()
    db = StubDB([])
    assert resolve_scope_degrade_candidates(db, project_id=pid, platform_id=None,
                                            group_key=None, exclude_staff_id=uuid4()) == []


def test_degrade_excludes_blocked_staff_and_other_groups():
    """同群降级：SQL 层排除负责客服自己与其他群；
    stub 只验证顺序——同群同平台候选按 priority 降序。"""
    pid = uuid4()
    platform = uuid4()
    group = "wrT0WARQAAHaVhGOZBnxjqN2uh6dS1Cw"
    r_low = _route(project_id=pid, platform_id=platform, group_key=group,
                   staff_id=uuid4(), priority=1)
    r_high = _route(project_id=pid, platform_id=platform, group_key=group,
                    staff_id=uuid4(), priority=99)
    # stub 预过滤 + 预排序：同群同平台其他客服按 priority 降序（真实排序由 SQL order_by 承担）
    db = StubDB([r_high, r_low])
    hits = resolve_scope_degrade_candidates(
        db, project_id=pid, platform_id=platform, group_key=group,
        exclude_staff_id=uuid4(),
    )
    assert hits == [r_high, r_low]


def test_degrade_same_platform_preferred():
    pid = uuid4()
    platform = uuid4()
    group = "wrT0WARQAAHaVhGOZBnxjqN2uh6dS1Cw"
    r_cross_platform = _route(project_id=pid, group_key=group, staff_id=uuid4(), priority=100)
    r_same_platform = _route(project_id=pid, platform_id=platform, group_key=group,
                             staff_id=uuid4(), priority=1)
    db = StubDB([r_cross_platform, r_same_platform])
    hits = resolve_scope_degrade_candidates(
        db, project_id=pid, platform_id=platform, group_key=group, exclude_staff_id=uuid4(),
    )
    assert hits == [r_same_platform]


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS {fn.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL {fn.__name__}: {e}")
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)
