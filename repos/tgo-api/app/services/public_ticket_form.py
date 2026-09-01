from __future__ import annotations

from html import escape


def render_public_ticket_form(token: str, *, error: str = "", success_number: str = "") -> str:
    """Render the dependency-free mobile public ticket form."""
    safe_token = escape(token, quote=True)
    notice = ""
    if success_number:
        notice = (
            '<div class="notice success">提交成功，工单号：'
            + escape(success_number)
            + "。客服将尽快与您联系。</div>"
        )
    elif error:
        notice = '<div class="notice error">' + escape(error) + "</div>"

    return f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>提交客服工单</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;background:#f5f7fb;color:#182230;font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}}
.card{{max-width:640px;margin:24px auto;padding:24px;background:#fff;border-radius:16px;box-shadow:0 8px 30px #1d293912}}
h1{{margin:0 0 6px;font-size:24px}}p{{margin:0 0 20px;color:#667085}}label{{display:block;margin:14px 0 6px;font-weight:600}}
input,textarea{{width:100%;padding:12px;border:1px solid #d0d5dd;border-radius:9px;font:inherit}}textarea{{min-height:130px;resize:vertical}}
button{{width:100%;margin-top:20px;padding:13px;border:0;border-radius:9px;background:#2563eb;color:#fff;font:inherit;font-weight:700}}
.hint{{font-size:13px;color:#667085}}.notice{{margin:12px 0;padding:12px;border-radius:8px}}.error{{background:#fef3f2;color:#b42318}}.success{{background:#ecfdf3;color:#067647}}
@media(max-width:680px){{.card{{margin:0;min-height:100vh;border-radius:0;padding:20px}}}}
</style></head><body><main class="card"><h1>提交客服工单</h1>
<p>请补充问题和联系方式，客服收到后会尽快处理。</p>{notice}
<form method="post" enctype="multipart/form-data" action="/api/v1/public-tickets/{safe_token}">
<label for="title">问题标题</label><input id="title" name="title" maxlength="120" required>
<label for="description">问题描述</label><textarea id="description" name="description" maxlength="20000" required></textarea>
<label for="contact_name">联系人</label><input id="contact_name" name="contact_name" maxlength="100" required>
<label for="contact_phone">联系电话</label><input id="contact_phone" name="contact_phone" inputmode="tel" maxlength="32" required>
<label for="images">问题图片</label><input id="images" name="images" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif">
<div class="hint">最多 5 张；支持 JPG、PNG、WebP、GIF；每张不超过 8 MB。</div>
<button type="submit">提交工单</button></form></main></body></html>"""
