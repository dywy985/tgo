from app.models.reply_monitor import (
    ReplyMonitorMediaRecoveryCandidate,
    ReplyMonitorMediaRecoveryJob,
    WeComConversationBinding,
    WeComJumpGrant,
)


def test_new_tables_are_project_isolated_and_chat_id_is_binding_only():
    assert WeComConversationBinding.__tablename__ == "api_wecom_conversation_bindings"
    assert "project_id" in WeComConversationBinding.__table__.columns
    assert "wecom_chat_id" in WeComConversationBinding.__table__.columns
    assert "wecom_chat_id" not in WeComJumpGrant.__table__.columns


def test_recovery_candidates_are_quarantined_until_confirmation():
    assert ReplyMonitorMediaRecoveryJob.__tablename__ == "api_reply_monitor_media_recovery_jobs"
    assert ReplyMonitorMediaRecoveryCandidate.__tablename__ == "api_reply_monitor_media_recovery_candidates"
    assert "status" in ReplyMonitorMediaRecoveryCandidate.__table__.columns
    assert "storage_path" in ReplyMonitorMediaRecoveryCandidate.__table__.columns
