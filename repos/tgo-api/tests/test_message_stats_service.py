"""Tests for the unified message stats service (方案B).

Uses an in-memory SQLite database to validate session creation and
atomic counter increments — no external DB / network required.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.database import Base
from app.models import SessionStatus, VisitorSession
from app.services import message_stats_service


@pytest.fixture
def db() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    # 只建测试需要的表, 避开其他表里的 PG 特有类型 (ARRAY/INET 等)
    Base.metadata.create_all(engine, tables=[VisitorSession.__table__])
    TestSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = TestSession()
    yield session
    session.close()
    engine.dispose()


def _mk_session(db: Session) -> VisitorSession:
    return message_stats_service.ensure_open_session(
        db,
        visitor_id=uuid4(),
        project_id=uuid4(),
        platform_id=uuid4(),
    )


def test_ensure_open_session_creates_once_and_reuses(db: Session) -> None:
    visitor_id = uuid4()
    project_id = uuid4()

    s1 = message_stats_service.ensure_open_session(
        db, visitor_id=visitor_id, project_id=project_id
    )
    s2 = message_stats_service.ensure_open_session(
        db, visitor_id=visitor_id, project_id=project_id
    )

    assert s1.id == s2.id
    assert s1.status == SessionStatus.OPEN.value
    db.commit()
    assert db.query(VisitorSession).count() == 1


def test_record_message_increments_kind_and_total(db: Session) -> None:
    session = _mk_session(db)
    db.commit()

    message_stats_service.record_message(db, session_id=session.id, kind="visitor")
    message_stats_service.record_message(db, session_id=session.id, kind="visitor")
    message_stats_service.record_message(db, session_id=session.id, kind="ai")
    message_stats_service.record_message(db, session_id=session.id, kind="staff")
    db.commit()

    db.expire_all()
    row = db.query(VisitorSession).filter(VisitorSession.id == session.id).one()
    assert row.visitor_message_count == 2
    assert row.ai_message_count == 1
    assert row.staff_message_count == 1
    assert row.message_count == 4
    assert row.last_message_at is not None


def test_record_message_increments_count_parameter(db: Session) -> None:
    session = _mk_session(db)
    db.commit()

    message_stats_service.record_message(db, session_id=session.id, kind="ai", count=5)
    db.commit()

    db.expire_all()
    row = db.query(VisitorSession).filter(VisitorSession.id == session.id).one()
    assert row.ai_message_count == 5
    assert row.message_count == 5


def test_record_message_rejects_unknown_kind(db: Session) -> None:
    session = _mk_session(db)
    db.commit()
    with pytest.raises(ValueError):
        message_stats_service.record_message(db, session_id=session.id, kind="bogus")


def test_multiple_visitors_get_separate_sessions(db: Session) -> None:
    a = _mk_session(db)
    b = _mk_session(db)
    db.commit()

    message_stats_service.record_message(db, session_id=a.id, kind="visitor")
    message_stats_service.record_message(db, session_id=b.id, kind="ai")
    db.commit()

    db.expire_all()
    ra = db.query(VisitorSession).filter(VisitorSession.id == a.id).one()
    rb = db.query(VisitorSession).filter(VisitorSession.id == b.id).one()
    assert a.id != b.id
    assert ra.visitor_message_count == 1 and ra.ai_message_count == 0
    assert rb.ai_message_count == 1 and rb.visitor_message_count == 0
