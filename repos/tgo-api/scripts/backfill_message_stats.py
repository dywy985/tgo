#!/usr/bin/env python3
"""存量会话消息计数回填脚本 (backfill_message_stats.py).

背景:
    tgo 统计面板 (stats_service) 依赖 api_visitor_sessions 上的三个计数
    字段: visitor_message_count / ai_message_count / staff_message_count。
    方案B 之前这些字段从未被累加, 且普通 AI 对话不创建 VisitorSession,
    导致存量数据全部为 0。本脚本把历史消息从 tgo-platform 的
    pt_wecom_inbox 消息表回填到 api_visitor_sessions, 让存量统计准确。

数据关联 (tgo-api 与 tgo-platform 共享同一 Postgres, 但表前缀不同):
    pt_wecom_inbox.platform_id  -> pt_platforms (tgo-platform 平台表)
    pt_platforms.api_key         = api_platforms.api_key  (两库平台按 api_key 关联)
    api_platforms.id             = api_visitors.platform_id
    api_visitors.platform_open_id = pt_wecom_inbox.from_user
    (wecom_reader/worktool 桥里 from_user = 企微群会话 ID "R:xxx", 一个群一个 visitor)

计数口径:
    - visitor 消息数 = pt_wecom_inbox 中 is_from_colleague = false 的记录数
    - staff 消息数   = is_from_colleague = true  的记录数
    - ai 回复数      = ai_reply 非空且非空串的记录数
    仅统计 source_type in ('wecom_reader','worktool','wecom_bot') 的桥消息,
    wecom_kf (官方企微客服) 消息不在此表完整记录, 不在本脚本范围。

用法:
    # 在 tgo-api 容器内或本机 (需可连库, DATABASE_URL 指向 tgo 库)
    DATABASE_URL="postgresql://tgo:tgo@localhost:5432/tgo" \
        python scripts/backfill_message_stats.py

    # 仅统计不落库 (dry-run)
    ... python scripts/backfill_message_stats.py --dry-run

    # 只回填指定平台 (按 tgo-api 平台名模糊匹配)
    ... python scripts/backfill_message_stats.py --platform 客服

安全:
    - 默认只对现有 open VisitorSession 回填 (确保会话归属正确);
    - 幂等: 每次重新从 inbox 统计后覆盖写, 可重复运行。
"""

from __future__ import annotations

import argparse
import os
import sys

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def get_sync_database_url() -> str:
    """Get synchronous psycopg2 database URL from env or app config."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        try:
            from app.core.config import settings
            return settings.database_url_sync
        except Exception:
            pass
    if not database_url:
        print("Error: DATABASE_URL not found. Set it or run inside app context.")
        sys.exit(1)
    if "postgresql+asyncpg://" in database_url:
        return database_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    if "postgresql+psycopg2://" in database_url:
        return database_url
    if "postgresql://" in database_url:
        return database_url.replace("postgresql://", "postgresql+psycopg2://")
    return database_url


# 候选会话: 可选平台过滤
def _base_session_sql(with_platform: bool) -> str:
    sql = (
        "SELECT s.id, ap.name AS platform_name "
        "FROM api_visitor_sessions s "
        "JOIN api_visitors v ON v.id = s.visitor_id "
        "JOIN api_platforms ap ON ap.id = v.platform_id "
    )
    if with_platform:
        sql += "WHERE ap.name ILIKE :pname AND s.status = 'open' "
    else:
        sql += "WHERE s.status = 'open' "
    sql += "ORDER BY s.created_at"
    return sql


# 对一组会话批量统计 (按 session_id IN)
def _stats_sql(placeholders: str) -> str:
    return f"""
    SELECT
        s.id AS session_id,
        COUNT(*) FILTER (WHERE wi.is_from_colleague = FALSE) AS visitor_count,
        COUNT(*) FILTER (WHERE wi.is_from_colleague = TRUE)  AS staff_count,
        COUNT(*) FILTER (WHERE wi.ai_reply IS NOT NULL
                         AND btrim(wi.ai_reply::text) <> '')  AS ai_count
    FROM api_visitor_sessions s
    JOIN api_visitors v ON v.id = s.visitor_id
    JOIN api_platforms ap ON ap.id = v.platform_id
    JOIN pt_platforms pp ON pp.api_key = ap.api_key
    JOIN pt_wecom_inbox wi
         ON wi.platform_id = pp.id
        AND wi.from_user = v.platform_open_id
    WHERE wi.source_type IN ('wecom_reader', 'worktool', 'wecom_bot')
      AND s.id IN ({placeholders})
    GROUP BY s.id
    """


def main() -> None:
    parser = argparse.ArgumentParser(description="存量会话消息计数回填")
    parser.add_argument("--dry-run", action="store_true", help="仅统计不写库")
    parser.add_argument("--platform", default="", help="仅回填指定平台名(模糊匹配, 可选)")
    parser.add_argument("--limit", type=int, default=0, help="最多回填 N 个会话 (调试用)")
    args = parser.parse_args()

    database_url = get_sync_database_url()
    from sqlalchemy import create_engine, text

    try:
        engine = create_engine(database_url)
        db = engine.connect()
    except Exception as e:
        print(f"Error: DB connect failed: {e}")
        sys.exit(1)

    try:
        # 1) 候选会话
        params = {}
        base_sql = _base_session_sql(bool(args.platform))
        if args.platform:
            params["pname"] = f"%{args.platform}%"
        if args.limit:
            base_sql += f" LIMIT {args.limit}"
        cand_rows = db.execute(text(base_sql), params).fetchall()
        session_ids = [r[0] for r in cand_rows]
        if not session_ids:
            print("无候选会话。")
            return

        # 2) 批量统计 (分块避免 IN 过长)
        stats = {}
        chunk = 500
        for i in range(0, len(session_ids), chunk):
            batch = session_ids[i : i + chunk]
            placeholders = ", ".join([f":sid_{j}" for j in range(len(batch))])
            bind = {f"sid_{j}": s for j, s in enumerate(batch)}
            rows = db.execute(text(_stats_sql(placeholders)), bind).fetchall()
            for r in rows:
                stats[r[0]] = r

        # 3) 写库/输出
        total_visitor = total_ai = total_staff = 0
        updated = 0
        for sid, pname in cand_rows:
            row = stats.get(sid)
            if not row:
                continue
            if not row.visitor_count and not row.ai_count and not row.staff_count:
                continue
            msg_count = (row.visitor_count or 0) + (row.ai_count or 0) + (row.staff_count or 0)
            total_visitor += row.visitor_count or 0
            total_ai += row.ai_count or 0
            total_staff += row.staff_count or 0
            updated += 1
            if args.dry_run:
                print(f"  [DRY] {pname} session={sid} visitor={row.visitor_count} "
                      f"ai={row.ai_count} staff={row.staff_count}")
            else:
                db.execute(
                    text(
                        "UPDATE api_visitor_sessions SET "
                        "visitor_message_count=:v, ai_message_count=:a, "
                        "staff_message_count=:s, message_count=:m "
                        "WHERE id=:sid AND status='open'"
                    ),
                    {
                        "v": row.visitor_count, "a": row.ai_count,
                        "s": row.staff_count, "m": msg_count,
                        "sid": sid,
                    },
                )
                print(f"  [SET ] {pname} session={sid} visitor={row.visitor_count} "
                      f"ai={row.ai_count} staff={row.staff_count}")

        if not args.dry_run:
            db.commit()

        print("=" * 50)
        print(f"处理会话: {updated} 个")
        print(f"访客消息合计: {total_visitor}")
        print(f"AI回复合计: {total_ai}")
        print(f"客服消息合计: {total_staff}")
        print("模式:", "DRY-RUN (未写库)" if args.dry_run else "已写库")
        print("=" * 50)

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
