from __future__ import annotations


def build_ticket_fallback_text(url: str) -> str:
    if url:
        return (
            "抱歉，当前客服暂未能及时答复。请点击下方链接提交工单，"
            "补充问题图片、联系人和联系电话，我们会尽快跟进：\n"
            + url
        )
    return "抱歉，当前客服暂未能及时答复，已为您转交人工客服，请稍后。"
