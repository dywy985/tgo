"""Deterministic text classification shared by live ingest and history replay."""

from __future__ import annotations

from dataclasses import dataclass
import re
import unicodedata


RULE_VERSION = "reply-monitor-rules-v3"
MEDIA_PLACEHOLDERS = {"[图片]", "【图片】", "[image]", "[语音]", "[视频]", "[文件]", "[其他消息]"}
CHITCHAT_EXACT = {
    "你好", "您好", "在吗", "收到", "好的", "好", "谢谢", "感谢", "哦", "嗯", "嗯嗯", "哈哈", "哈哈哈",
}
BUSINESS_TERMS = (
    "系统", "软件", "主机", "分机", "pda", "wms", "k6", "k8", "k9", "激活", "授权", "工单", "发票",
    "登录", "账号", "密码", "安装", "下载", "升级", "版本", "库存", "缺货", "盘点", "重盘",
    "作废", "打印", "上传", "同步", "单据", "订单", "发货", "物流", "追溯码", "挂单", "入库",
)
RESOLUTION_TERMS = (
    "已经好了", "好了", "已解决", "解决了", "处理好了", "成功了", "恢复了", "可以了", "可以用了",
    "已经能用了", "没问题了", "没有问题了",
)
FAILURE_PATTERNS = tuple(re.compile(pattern, re.IGNORECASE) for pattern in (
    r"(?:连接|连|登录|登|进|接)?不上",
    r"(?:登录|登|进)不去",
    r"(?:显示|打印|作废|上传|下载|同步|保存|删除|打开|使用|用)不了",
    r"(?:显示|查|找)不出来",
    r"(?:找|查)不到",
    r"(?:没|未)(?:好|到|找到|显示|上传|同步|成功|生效|收到|恢复)",
    r"不(?:显示|同步|生效|成功|一致|匹配|正常)",
    r"对不上|不同步|还是不行|又不行|进不去|打不开|不能用|用不了|无法",
    r"报错|失败|异常|闪退|卡住|没反应|丢失|坏了|缺货|占用|有问题",
))
QUESTION_PATTERNS = tuple(re.compile(pattern, re.IGNORECASE) for pattern in (
    r"怎么|如何|为什么|怎么办|咋办|请问|能不能|能否|是否|有没有|哪里|哪儿|什么原因|多少钱",
    r"(?:吗|么|嘛|呢|？|\?)$",
))
REQUEST_PATTERNS = tuple(re.compile(pattern, re.IGNORECASE) for pattern in (
    r"转人工|找客服|人工客服",
    r"麻烦.{0,8}(?:看|查|处理|调|解决)",
    r"请.{0,8}(?:帮|看|查|处理|调|解决)",
    r"帮(?:我|忙).{0,8}(?:看|查|处理|调|解决)?",
    r"协助.{0,8}(?:处理|解决)",
))


@dataclass(frozen=True)
class ProblemClassification:
    score: int
    normalized_text: str
    rule_version: str
    reasons: tuple[str, ...]


def normalize_problem_text(value: str | None) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    text = re.sub(r"(?:^|\s)@[^\s，,。！？!?：:]+", " ", text)
    return " ".join(text.split()).strip("，,。！？!?；;：:~～ ")


def _last_pattern_end(text: str, patterns: tuple[re.Pattern, ...]) -> int:
    return max((match.end() for pattern in patterns for match in pattern.finditer(text)), default=-1)


def _last_term_end(text: str, terms: tuple[str, ...]) -> int:
    return max((text.rfind(term) + len(term) for term in terms if term in text), default=-1)


def classify_problem_text(value: str | None, *, message_type: str = "text") -> ProblemClassification:
    """Classify the current utterance using conservative, auditable rules."""
    text = normalize_problem_text(value)
    reasons: list[str] = []
    if not text:
        return ProblemClassification(0, text, RULE_VERSION, tuple(reasons))
    if str(message_type or "").lower() == "other":
        return ProblemClassification(0, text, RULE_VERSION, ("unstructured_content",))
    if str(message_type or "").lower() == "image" or text in MEDIA_PLACEHOLDERS:
        return ProblemClassification(0, text, RULE_VERSION, ("media_only",))
    if text.isdigit() or text.strip("，。！？!?~～ ") in CHITCHAT_EXACT:
        return ProblemClassification(0, text, RULE_VERSION, ("chitchat",))

    failure_end = _last_pattern_end(text, FAILURE_PATTERNS)
    resolution_end = _last_term_end(text, RESOLUTION_TERMS)
    has_failure = failure_end >= 0
    # Only a later, unambiguous resolution suppresses an earlier failure.
    if resolution_end >= 0 and resolution_end > failure_end:
        return ProblemClassification(0, text, RULE_VERSION, ("resolved",))

    score = 0
    if has_failure:
        score += 75
        reasons.append("issue")
    if any(pattern.search(text) for pattern in REQUEST_PATTERNS):
        score += 65
        reasons.append("request")
    if any(pattern.search(text) for pattern in QUESTION_PATTERNS):
        score += 30
        reasons.append("question")
    if any(term in text for term in BUSINESS_TERMS):
        score += 25
        reasons.append("business")
    return ProblemClassification(min(100, score), text, RULE_VERSION, tuple(reasons))


def authoritative_problem_metadata(
    metadata: dict | None,
    current_content: str | None,
    message_type: str,
) -> dict:
    """Replace transport scoring with the API classifier and retain its audit trail."""
    result = dict(metadata or {})
    if "problem_score" in result:
        result["upstream_problem_score"] = result.get("problem_score")
    if result.get("problem_rule_version"):
        result["upstream_problem_rule_version"] = result.get("problem_rule_version")
    classification = classify_problem_text(current_content, message_type=message_type)
    result.update({
        "problem_score": classification.score,
        "problem_threshold": 50,
        "problem_rule_version": classification.rule_version,
        "problem_reasons": list(classification.reasons),
        "normalized_text": classification.normalized_text,
        "media_only": "media_only" in classification.reasons,
    })
    return result


def is_resolution_text(value: str | None) -> bool:
    text = normalize_problem_text(value)
    if not text or any(pattern.search(text) for pattern in QUESTION_PATTERNS):
        return False
    failure_end = _last_pattern_end(text, FAILURE_PATTERNS)
    resolution_end = _last_term_end(text, RESOLUTION_TERMS)
    return resolution_end >= 0 and resolution_end > failure_end


def is_substantive_staff_reply(value: str | None, message_type: str | None) -> bool:
    """Whether an unquoted staff event is enough to count as a human response."""
    kind = str(message_type or "text").lower()
    if kind in {"image", "file", "voice", "video"}:
        return True
    text = normalize_problem_text(value)
    if not text or text in MEDIA_PLACEHOLDERS:
        return False
    return bool(re.search(r"[0-9a-z\u4e00-\u9fff]", text, re.IGNORECASE))
