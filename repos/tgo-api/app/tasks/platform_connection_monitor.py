"""Keep activated channel configuration applied and persist WorkTool gaps."""

from __future__ import annotations

import asyncio
import logging

from app.core.database import SessionLocal
from app.models import Platform, PlatformDataResetJob
from app.api.v1.endpoints.platform_connections import (
    _record_worktool_gaps, _runtime_call, _runtime_discovered_users, _runtime_status, _secret_envelope,
)
from app.services.wecom_identity_service import mark_sync_failure, sync_runtime_identities

logger = logging.getLogger(__name__)
_task: asyncio.Task | None = None
_reset_tasks: set[asyncio.Task] = set()


def runtime_config_requires_activation(runtime: dict, expected_version: int) -> bool:
    """A fresh gateway (version 0) or a real version mismatch activates once."""
    try:
        runtime_version = int(runtime.get("config_version") or runtime.get("version") or 0)
    except (TypeError, ValueError):
        runtime_version = 0
    return runtime_version != int(expected_version)


async def _resume_unfinished_resets() -> None:
    from app.api.v1.endpoints.platform_connections import _run_data_reset
    db = SessionLocal()
    try:
        ids = [row[0] for row in db.query(PlatformDataResetJob.id).filter(PlatformDataResetJob.status.notin_(["completed", "failed"])).all()]
    finally:
        db.close()
    for job_id in ids:
        reset_task = asyncio.create_task(_run_data_reset(job_id))
        _reset_tasks.add(reset_task)
        reset_task.add_done_callback(_reset_tasks.discard)


async def reconcile_once() -> None:
    db = SessionLocal()
    try:
        platforms = db.query(Platform).filter(Platform.type.in_(["worktool", "wecom_bot"]), Platform.is_active.is_(True), Platform.deleted_at.is_(None)).all()
        for platform in platforms:
            try:
                if not platform.connection_active:
                    continue
                runtime = await _runtime_status(platform)
                if runtime_config_requires_activation(runtime, platform.connection_version):
                    secrets = _secret_envelope(platform).get("active") or {}
                    await _runtime_call(platform, "activate", platform.connection_active, secrets, version=platform.connection_version)
                    runtime = await _runtime_status(platform)
                gaps = _record_worktool_gaps(db, platform, runtime)
                if gaps:
                    from app.api.v1.endpoints.platform_connections import _notify_gap_admins
                    await _notify_gap_admins(db, platform, gaps)
                if platform.type == "wecom_bot":
                    if runtime.get("reason") == "runtime_unreachable":
                        mark_sync_failure(db, platform, "runtime_unreachable")
                    else:
                        try:
                            discovered = await _runtime_discovered_users(platform)
                            sync_runtime_identities(db, platform, discovered)
                        except Exception as exc:
                            db.rollback()
                            mark_sync_failure(db, platform, type(exc).__name__)
            except Exception:
                db.rollback()
                logger.exception("platform connection reconciliation failed platform=%s", platform.id)
    except Exception:
        db.rollback()
        logger.exception("platform connection reconciliation failed")
    finally:
        db.close()


async def _loop() -> None:
    while True:
        try:
            await reconcile_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("platform connection monitor iteration failed")
        await asyncio.sleep(30)


def start_platform_connection_monitor() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop())
        asyncio.create_task(_resume_unfinished_resets())


async def stop_platform_connection_monitor() -> None:
    global _task
    if _task:
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
        _task = None
    for reset_task in list(_reset_tasks):
        reset_task.cancel()
