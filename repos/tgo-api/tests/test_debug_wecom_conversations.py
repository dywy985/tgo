from __future__ import annotations

import asyncio
from types import SimpleNamespace
from uuid import uuid4

from app.api.v1.endpoints import debug_wecom


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows


class _SessionDb:
    def __init__(self, rows):
        self._rows = rows
        self.statements = []
        self.params = []

    def execute(self, statement, params):
        self.statements.append(str(statement))
        self.params.append(params)
        return _Rows(self._rows)


def test_conversation_key_round_trips_group_names_with_colons():
    platform_id = uuid4()
    key = debug_wecom._make_conversation_key(platform_id, "售后:华东群")

    assert debug_wecom._parse_conversation_key(key) == (
        platform_id,
        "售后:华东群",
    )


def test_sessions_expose_canonical_key_instead_of_device_identity():
    platform_id = uuid4()
    db = _SessionDb([
        {
            "platform_id": platform_id,
            "conversation_ref": "内部测试群",
            "conv_name": "内部测试群",
            "msg_count": 6,
            "last_at": None,
        }
    ])

    result = asyncio.run(debug_wecom.wecom_sessions(
        db=db,
        current_user=SimpleNamespace(project_id=uuid4()),
    ))

    expected_key = f"{platform_id}:内部测试群"
    assert result["sessions"] == [{
        "conversation_key": expected_key,
        "from_user": expected_key,
        "conv_name": "内部测试群",
        "msg_count": 6,
        "last_at": None,
    }]
    assert "GROUP BY platform_id, conversation_ref" in db.statements[0]
    assert "BTRIM(raw_payload->>'conv_name')" in db.statements[0]
    assert "project_id=:project_id" in db.statements[0]


def test_messages_accept_canonical_key_and_keep_project_isolation():
    platform_id = uuid4()
    db = _SessionDb([])

    result = asyncio.run(debug_wecom.wecom_messages(
        conv=f"{platform_id}:售后群",
        limit=200,
        db=db,
        current_user=SimpleNamespace(project_id=uuid4()),
    ))

    assert result == {"count": 0, "messages": []}
    assert db.params[0]["platform_id"] == str(platform_id)
    assert db.params[0]["conversation_ref"] == "售后群"
    assert "project_id" in db.params[0]
    assert "platform_id = :platform_id" in db.statements[0]
    assert "BTRIM(raw_payload->>'conv_name')" in db.statements[0]


def test_messages_still_accept_legacy_from_user_key():
    db = _SessionDb([])

    asyncio.run(debug_wecom.wecom_messages(
        conv="wt:old-device:售后群",
        limit=200,
        db=db,
        current_user=SimpleNamespace(project_id=uuid4()),
    ))

    assert db.params[0]["conv"] == "wt:old-device:售后群"
    assert "platform_id" not in db.params[0]
