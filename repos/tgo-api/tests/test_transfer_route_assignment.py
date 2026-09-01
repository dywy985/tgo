"""assign_staff 路由分配分支单元测试（mock 依赖，验证编排决策）。

覆盖：
  1. 路由命中 + 客服可服务 → 直接分配（source=route），不走通用候选
  2. 路由命中 + 不可服务 + 无降级候选 → scope_blocked（强绑定，不分配他人）
  3. 路由命中 + 不可服务 + 有降级候选 → scope_degrade
  4. 无路由 → 走通用分配（source=normal）
"""
import asyncio
import os
import sys
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-1234567890")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:test@localhost:5432/tgo_api_test")

sys.path.insert(0, r"C:\陈泓森的\项目\人工智能客服\企业微信智能客服系统v2.0\tgo\repos\tgo-api")

from app.services import transfer_service


class _Q:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *a, **k):
        return self

    def order_by(self, *a, **k):
        return self

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return self._rows

    def scalar(self):
        return 0


class StubDB:
    def __init__(self, visitor=None, settings=None):
        self._visitor = visitor
        self._settings = settings

    def query(self, model):
        name = getattr(model, "__name__", "")
        if name == "Visitor":
            return _Q([self._visitor] if self._visitor else [])
        if name == "TicketSettings":
            return _Q([self._settings] if self._settings else [])
        return _Q([])


def _visitor():
    return SimpleNamespace(
        id=uuid4(), project_id=uuid4(), platform_id=uuid4(),
        platform_open_id="wm-EXTERNAL123", deleted_at=None,
    )


def _route(staff_id=None):
    return SimpleNamespace(staff_id=staff_id or uuid4(), deleted_at=None)


def _staff(is_active=True, service_paused=False):
    return SimpleNamespace(is_active=is_active, service_paused=service_paused)


def run(coro):
    return asyncio.run(coro)


def test_route_hit_serviceable_direct_assign():
    """路由命中 + 客服可服务 → 直接分配，不触碰通用候选。"""
    visitor = _visitor()
    route = _route()
    db = StubDB(visitor=visitor)
    with patch.object(transfer_service, "resolve_ticket_route", return_value=route), \
         patch.object(transfer_service, "_staff_serviceable", return_value=(True, None)), \
         patch.object(transfer_service, "_get_available_staff_candidates",
                      side_effect=AssertionError("不应进入通用候选")) as m:
        result = run(transfer_service.assign_staff(
            db, visitor_id=visitor.id, project_id=visitor.project_id,
            platform_id=visitor.platform_id, group_key="groupA", visitor_key=visitor.platform_open_id,
        ))
        m.assert_not_called()
    assert result.assigned_staff_id == route.staff_id
    assert result.assignment_source == "route"
    assert result.scope_blocked_staff_id is None


def test_route_hit_unavailable_no_degrade_blocked():
    """路由命中 + 不可服务 + 无降级候选 → scope_blocked（强绑定不分配他人）。"""
    visitor = _visitor()
    route = _route()
    db = StubDB(visitor=visitor)
    with patch.object(transfer_service, "resolve_ticket_route", return_value=route), \
         patch.object(transfer_service, "_staff_serviceable", return_value=(False, "staff_offline")), \
         patch.object(transfer_service, "_try_scope_degrade", return_value=None), \
         patch.object(transfer_service, "_get_available_staff_candidates",
                      side_effect=AssertionError("scope_blocked 不得进入通用分配")):
        result = run(transfer_service.assign_staff(
            db, visitor_id=visitor.id, project_id=visitor.project_id,
            platform_id=visitor.platform_id, group_key="groupA",
        ))
    assert result.assigned_staff_id is None
    assert result.scope_blocked_staff_id == route.staff_id
    assert result.scope_blocked_reason == "staff_offline"
    assert result.assignment_source == "route_blocked"


def test_route_hit_unavailable_degrade_to_peer():
    """路由命中 + 不可服务 + 同群降级候选可服务 → scope_degrade。"""
    visitor = _visitor()
    route = _route()
    peer_id = uuid4()
    db = StubDB(visitor=visitor)
    with patch.object(transfer_service, "resolve_ticket_route", return_value=route), \
         patch.object(transfer_service, "_staff_serviceable", return_value=(False, "staff_paused")), \
         patch.object(transfer_service, "_try_scope_degrade", return_value=peer_id), \
         patch.object(transfer_service, "_get_available_staff_candidates",
                      side_effect=AssertionError("降级后不得进入通用分配")):
        result = run(transfer_service.assign_staff(
            db, visitor_id=visitor.id, project_id=visitor.project_id,
            platform_id=visitor.platform_id, group_key="groupA",
        ))
    assert result.assigned_staff_id == peer_id
    assert result.assignment_source == "scope_degrade"
    assert result.scope_blocked_staff_id is None


def test_no_route_falls_back_to_generic():
    """无路由命中 → 通用分配（无候选时 assigned=None, source=normal）。"""
    visitor = _visitor()
    db = StubDB(visitor=visitor)
    with patch.object(transfer_service, "resolve_ticket_route", return_value=None), \
         patch.object(transfer_service, "_get_available_staff_candidates", return_value=[]):
        result = run(transfer_service.assign_staff(
            db, visitor_id=visitor.id, project_id=visitor.project_id,
            platform_id=visitor.platform_id,
        ))
    assert result.assigned_staff_id is None
    assert result.assignment_source == "normal"
    assert result.scope_blocked_staff_id is None


def test_scope_degrade_disabled_blocks():
    """开关关闭（scope_degrade=False）→ 不可服务直接 blocked，不尝试降级。"""
    visitor = _visitor()
    route = _route()
    db = StubDB(visitor=visitor)
    with patch.object(transfer_service, "resolve_ticket_route", return_value=route), \
         patch.object(transfer_service, "_staff_serviceable", return_value=(False, "outside_hours")), \
         patch.object(transfer_service, "_try_scope_degrade",
                      side_effect=AssertionError("开关关闭不得尝试降级")):
        result = run(transfer_service.assign_staff(
            db, visitor_id=visitor.id, project_id=visitor.project_id,
            platform_id=visitor.platform_id, group_key="groupA", scope_degrade=False,
        ))
    assert result.scope_blocked_staff_id == route.staff_id
    assert result.scope_blocked_reason == "outside_hours"


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS {fn.__name__}")
        except Exception as e:
            failed += 1
            print(f"FAIL {fn.__name__}: {e}")
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)
