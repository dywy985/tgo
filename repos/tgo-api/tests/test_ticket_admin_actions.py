from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException, Response

from app.api.v1.endpoints import tickets as tickets_endpoint
from app.schemas.ticket import TicketStatusChange


class _TicketDb:
    def __init__(self) -> None:
        self.added = []
        self.commits = 0

    def add(self, value):
        self.added.append(value)

    def commit(self):
        self.commits += 1

    def refresh(self, value):
        return None


def _ticket(status: str = "pending_reply"):
    return SimpleNamespace(
        id=uuid4(),
        project_id=uuid4(),
        number="TK-20260907-0001",
        status=status,
        replied_at=None,
        first_response_at=None,
        archived_at=None,
        deleted_at=None,
    )


@pytest.mark.anyio
async def test_admin_can_set_pending_ticket_to_any_valid_status(monkeypatch):
    db = _TicketDb()
    ticket = _ticket()
    admin = SimpleNamespace(id=uuid4(), project_id=ticket.project_id, role="admin")
    monkeypatch.setattr(tickets_endpoint, "_get_owned_ticket", lambda *args: ticket)
    monkeypatch.setattr(tickets_endpoint, "_fill_display_names", lambda _db, item: item)

    result = await tickets_endpoint.change_ticket_status(
        ticket.id,
        TicketStatusChange(status="archived", note="管理员手动调整"),
        db,
        admin,
    )

    assert result.status == "archived"
    assert db.commits == 1


@pytest.mark.anyio
async def test_admin_setting_ticket_back_to_pending_clears_terminal_timestamps(monkeypatch):
    db = _TicketDb()
    ticket = _ticket(status="archived")
    ticket.replied_at = object()
    ticket.first_response_at = object()
    ticket.archived_at = object()
    admin = SimpleNamespace(id=uuid4(), project_id=ticket.project_id, role="admin")
    monkeypatch.setattr(tickets_endpoint, "_get_owned_ticket", lambda *args: ticket)
    monkeypatch.setattr(tickets_endpoint, "_fill_display_names", lambda _db, item: item)

    result = await tickets_endpoint.change_ticket_status(
        ticket.id,
        TicketStatusChange(status="pending_reply", note="管理员重新打开"),
        db,
        admin,
    )

    assert result.status == "pending_reply"
    assert result.replied_at is None
    assert result.first_response_at is None
    assert result.archived_at is None


@pytest.mark.anyio
async def test_non_admin_cannot_override_pending_ticket_status(monkeypatch):
    db = _TicketDb()
    ticket = _ticket()
    staff = SimpleNamespace(id=uuid4(), project_id=ticket.project_id, role="user")
    monkeypatch.setattr(tickets_endpoint, "_get_owned_ticket", lambda *args: ticket)

    with pytest.raises(HTTPException) as exc:
        await tickets_endpoint.change_ticket_status(
            ticket.id,
            TicketStatusChange(status="archived"),
            db,
            staff,
        )

    assert exc.value.status_code == 400
    assert ticket.status == "pending_reply"


def _ticket_delete_route():
    return next(
        route
        for route in tickets_endpoint.router.routes
        if getattr(route, "path", None) == "/{ticket_id}"
        and "DELETE" in getattr(route, "methods", set())
    )


def test_ticket_delete_route_requires_admin():
    route = _ticket_delete_route()

    dependency_names = {
        getattr(dependency.call, "__name__", "")
        for dependency in route.dependant.dependencies
    }
    assert "admin_dependency" in dependency_names
    assert route.response_class is Response


@pytest.mark.anyio
async def test_admin_delete_soft_deletes_owned_ticket(monkeypatch):
    db = _TicketDb()
    ticket = _ticket(status="replied")
    admin = SimpleNamespace(id=uuid4(), project_id=ticket.project_id, role="admin")
    monkeypatch.setattr(tickets_endpoint, "_get_owned_ticket", lambda *args: ticket)

    await _ticket_delete_route().endpoint(ticket.id, db, admin)

    assert ticket.deleted_at is not None
    assert db.commits == 1
