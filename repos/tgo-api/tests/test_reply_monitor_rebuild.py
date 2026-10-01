from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest

from app.services.reply_monitor_rebuild_service import (
    create_preview_token,
    decode_preview_token,
    historical_event_order_key,
    score_problem_text,
)
from app.services.reply_monitor_classifier import (
    authoritative_problem_metadata,
    classify_problem_text,
)


def test_rebuild_scorer_recognizes_today_business_failures():
    for text in ("作废不了", "能作废吗", "打印不了", "还是不行", "库存对不上", "库存不同步"):
        score, reasons = score_problem_text(text)
        assert score >= 50, (text, score, reasons)


def test_rebuild_scorer_keeps_context_free_confirmation_below_threshold():
    score, reasons = score_problem_text("重新补建了一单了，看下可以吗")

    assert score < 50
    assert "question" in reasons


@pytest.mark.parametrize(
    "text",
    [
        "@刘泓凡 分机连接不上主机",
        "我以为好了，但没好，WMS显示上传成功，但是追溯码没到门店，整单都未找到",
        "PDA上架只能显示出来100条嘛，我现在上架剩余的显示不出来，能给调一下嘛",
        "PDA上面的金博软件不小心删掉了，怎么下载",
        "这种需要我把对应的单据删掉，WMS重传么？",
        "他闪退后就这样，挂单里也找不到单的",
    ],
)
def test_rebuild_scorer_recognizes_observed_historical_customer_problems(text):
    score, reasons = score_problem_text(text)

    assert score >= 50, (text, score, reasons)


@pytest.mark.parametrize(
    "text",
    [
        "我明天早上看下。",
        "品种编码提供一下",
        "重新补建了一单了，看下可以吗",
        "收到",
        "@所有人 大家5点半发下本月业绩额和未收款",
    ],
)
def test_rebuild_scorer_rejects_observed_replies_and_internal_notices(text):
    score, reasons = score_problem_text(text)

    assert score < 50, (text, score, reasons)


def test_api_classifier_overrides_divergent_upstream_score_and_keeps_audit_values():
    metadata = authoritative_problem_metadata(
        {
            "problem_score": 0,
            "problem_rule_version": "worktool-rules-v2",
            "problem_reasons": [],
        },
        "分机连接不上主机",
        "text",
    )

    assert metadata["problem_score"] >= 50
    assert metadata["problem_rule_version"] == "reply-monitor-rules-v3"
    assert metadata["problem_reasons"] == ["issue", "business"]
    assert metadata["upstream_problem_score"] == 0
    assert metadata["upstream_problem_rule_version"] == "worktool-rules-v2"


def test_history_replay_orders_equal_message_times_by_ingest_time_then_id():
    occurred = datetime(2026, 9, 8, 0, 0, tzinfo=timezone.utc)
    earlier = SimpleNamespace(
        occurred_at=occurred,
        created_at=datetime(2026, 9, 8, 0, 0, 1, tzinfo=timezone.utc),
        id=UUID(int=2),
    )
    later_low_id = SimpleNamespace(
        occurred_at=occurred,
        created_at=datetime(2026, 9, 8, 0, 0, 2, tzinfo=timezone.utc),
        id=UUID(int=1),
    )

    assert sorted([later_low_id, earlier], key=historical_event_order_key) == [earlier, later_low_id]


def test_legacy_unstructured_quote_does_not_rescore_quoted_problem_as_new_question():
    rendered_quote = (
        "客服甲：@客户乙 OTC00344这个下午帮忙重新盘点下"
        "重盘了，你再看看 @客服甲"
    )

    result = classify_problem_text(rendered_quote, message_type="other")

    assert result.score == 0
    assert result.reasons == ("unstructured_content",)


def test_preview_token_is_scoped_expires_and_rejects_tampering():
    expires_at = datetime(2026, 9, 9, 4, 0, tzinfo=timezone.utc)
    start_at = datetime(2026, 9, 8, 16, 0, tzinfo=timezone.utc)
    token = create_preview_token(
        "secret", "project-1", "platform-1", start_at, expires_at,
        "snapshot-1", expires_at,
    )
    claims = decode_preview_token("secret", token, now=expires_at)
    assert claims.get("snapshot") == "snapshot-1"
    assert claims.get("platform_id") == "platform-1"
    assert claims.get("start_at") == start_at.isoformat()
    with pytest.raises(ValueError):
        decode_preview_token("secret", token + "x", now=expires_at)
