from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.ticket import TicketStatus, TICKET_STATUS_TRANSITIONS
from app.schemas.ticket import TicketCreate, TicketStatusChange
from app.services.reply_monitor_ticket_service import transition_monitor_ticket_to_replied
from app.services.ticket_service import create_ticket


class _Db:
    def __init__(self, ticket=None):
        self.ticket = ticket
        self.added = []

    def get(self, model, key):
        return self.ticket if self.ticket and key == self.ticket.id else None

    def add(self, value):
        self.added.append(value)


def test_ticket_status_contract_is_reply_monitor_specific():
    assert {status.value for status in TicketStatus} == {
        "pending_reply", "replied", "archived"
    }


def test_upgrade_from_0034_never_deletes_existing_ticket_history():
    migration = Path(__file__).parents[1] / "alembic" / "versions" / "0037_monitor_ticket_workflow.py"
    source = migration.read_text(encoding="utf-8")

    assert "DELETE FROM api_tickets" not in source
    assert "DELETE FROM api_ticket_comments" not in source
    assert "DELETE FROM api_ticket_attachments" not in source
    assert "DELETE FROM api_ticket_status_history" not in source
    assert TICKET_STATUS_TRANSITIONS == {
        "pending_reply": {"replied"},
        "replied": {"archived"},
        "archived": {"replied"},
    }


def test_public_ticket_schemas_reject_legacy_statuses_and_sources():
    assert TicketStatusChange(status="replied").status == "replied"
    with pytest.raises(ValidationError):
        TicketStatusChange(status="resolved")
    with pytest.raises(ValidationError):
        TicketCreate(title="旧入口", description="不应建单", source="staff_manual")


def test_ticket_service_rejects_non_monitor_sources_before_db_work():
    with pytest.raises(HTTPException) as exc:
        create_ticket(
            _Db(), project_id=uuid4(), title="旧入口", description="不应建单",
            source="public_form",
        )
    assert exc.value.status_code == 409


def test_customer_service_reply_archives_pending_ticket():
    ticket_id = uuid4()
    ticket = SimpleNamespace(
        id=ticket_id,
        project_id=uuid4(),
        status="pending_reply",
        first_response_at=None,
        replied_at=None,
        archived_at=None,
        updated_at=None,
    )
    db = _Db(ticket)
    staff = SimpleNamespace(id=uuid4())
    replied_at = datetime(2026, 9, 3, 12, 30, tzinfo=timezone.utc)

    changed = transition_monitor_ticket_to_replied(
        db, SimpleNamespace(ticket_id=ticket_id), staff, replied_at
    )

    assert changed is True
    assert ticket.status == "archived"
    assert ticket.first_response_at == replied_at.replace(tzinfo=None)
    assert ticket.replied_at == replied_at.replace(tzinfo=None)
    assert ticket.archived_at == replied_at.replace(tzinfo=None)
    assert db.added[0].from_status == "pending_reply"
    assert db.added[0].to_status == "replied"
    assert db.added[1].from_status == "replied"
    assert db.added[1].to_status == "archived"


@pytest.mark.parametrize("status", ["replied", "archived"])
def test_reply_does_not_reopen_completed_ticket(status):
    ticket_id = uuid4()
    ticket = SimpleNamespace(id=ticket_id, project_id=uuid4(), status=status)
    db = _Db(ticket)

    assert transition_monitor_ticket_to_replied(
        db,
        SimpleNamespace(ticket_id=ticket_id),
        SimpleNamespace(id=uuid4()),
        datetime(2026, 9, 3, 12, 30, tzinfo=timezone.utc),
    ) is False
    assert db.added == []
