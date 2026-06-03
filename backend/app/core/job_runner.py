import json
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AsyncSessionLocal, Job, Module, Signal as SignalModel
from app.core.base_module import Signal
from app.core.module_registry import module_registry
from app.utils.hashing import is_duplicate_signal

logger = logging.getLogger(__name__)


def _log(level: str, message: str, **kwargs) -> None:
    record = {"time": datetime.now(timezone.utc).isoformat(), "level": level, "message": message, **kwargs}
    getattr(logger, level.lower(), logger.info)(json.dumps(record))


async def execute_module_job(module_instance_id: str, force: bool = False) -> Optional[str]:
    """
    Execute a single module job identified by module_instance_id (UUID string).
    Returns job_id on success, None on failure.

    force=True: run even if the module is currently paused (used for manual "Run Now").
    force=False (default): respect the enabled flag (used for scheduled runs).
    """
    job_id = str(uuid.uuid4())
    _log("info", "Job starting", module_instance_id=module_instance_id, job_id=job_id, forced=force)

    async with AsyncSessionLocal() as db:
        try:
            # 1. Load module instance from DB
            stmt = select(Module).where(Module.id == uuid.UUID(module_instance_id))
            result = await db.execute(stmt)
            module_row = result.scalar_one_or_none()

            if module_row is None:
                _log("error", "Module instance not found", module_instance_id=module_instance_id)
                return None

            if not module_row.enabled and not force:
                _log("info", "Module disabled, skipping", module_instance_id=module_instance_id)
                return None

            module_type = module_row.module_type
            config = module_row.config or {}
            user_id = module_row.user_id

            # 2. Create job record (status=running)
            job = Job(
                id=uuid.UUID(job_id),
                module_id=module_row.id,
                status="running",
                started_at=datetime.now(timezone.utc),
                signals_found=0,
            )
            db.add(job)
            await db.commit()

            # 3. Get module from registry
            module_instance = module_registry.get_module(module_type)
            if module_instance is None:
                _log("error", "Module type not found in registry", module_type=module_type)
                job.status = "failed"
                job.error = f"Module type '{module_type}' not registered"
                job.finished_at = datetime.now(timezone.utc)
                await db.commit()
                return None

            # 4. Run the module
            signals: List[Signal] = await module_instance.run(config, db, module_instance_id)
            _log("info", "Module run complete", module_type=module_type, signals_count=len(signals))

            # 5. Persist signals (dedup by content hash)
            new_signals = 0
            for sig in signals:
                content_hash = is_duplicate_signal(sig.title, sig.body, str(module_row.id))

                # Check for existing signal with same hash
                dup_stmt = select(SignalModel).where(
                    SignalModel.module_id == module_row.id,
                    SignalModel.meta["content_hash"].astext == content_hash,
                )
                dup_result = await db.execute(dup_stmt)
                existing = dup_result.scalar_one_or_none()

                if existing is not None:
                    _log("debug", "Duplicate signal skipped", hash=content_hash)
                    continue

                metadata = dict(sig.metadata)
                metadata["content_hash"] = content_hash

                signal_row = SignalModel(
                    id=uuid.uuid4(),
                    module_id=module_row.id,
                    user_id=user_id,
                    title=sig.title,
                    body=sig.body,
                    score=max(0.0, min(1.0, sig.score)),
                    source_url=sig.source_url,
                    meta=metadata,
                    created_at=datetime.now(timezone.utc),
                    read=False,
                    archived=False,
                )
                db.add(signal_row)
                new_signals += 1

            await db.commit()

            # 6. Update job record
            job.status = "success"
            job.finished_at = datetime.now(timezone.utc)
            job.signals_found = new_signals
            await db.commit()

            _log(
                "info",
                "Job completed successfully",
                job_id=job_id,
                signals_new=new_signals,
                signals_total=len(signals),
            )

            # 7. Trigger alert delivery for high-score signals
            await _check_and_queue_alerts(db, module_row.id, user_id, new_signals)

            return job_id

        except Exception as exc:
            _log("error", "Job failed with exception", job_id=job_id, error=str(exc), exc_info=True)
            try:
                # Try to mark job as failed
                job_stmt = select(Job).where(Job.id == uuid.UUID(job_id))
                job_result = await db.execute(job_stmt)
                job_obj = job_result.scalar_one_or_none()
                if job_obj:
                    job_obj.status = "failed"
                    job_obj.error = str(exc)[:2000]
                    job_obj.finished_at = datetime.now(timezone.utc)
                    await db.commit()
            except Exception as inner_exc:
                _log("error", "Could not update job status", error=str(inner_exc))
            return None


async def _check_and_queue_alerts(
    db: AsyncSession,
    module_id: uuid.UUID,
    user_id: uuid.UUID,
    new_signals_count: int,
) -> None:
    """Queue alert delivery for high-score signals that haven't been alerted yet."""
    if new_signals_count == 0:
        return

    from app.core.alert_delivery import send_signal_alert

    # Fetch high-score unread signals without an existing alert
    stmt = (
        select(SignalModel)
        .where(
            SignalModel.module_id == module_id,
            SignalModel.user_id == user_id,
            SignalModel.score >= 0.75,
            SignalModel.read == False,
        )
        .order_by(SignalModel.created_at.desc())
        .limit(10)
    )
    result = await db.execute(stmt)
    high_priority_signals = result.scalars().all()

    for signal in high_priority_signals:
        try:
            await send_signal_alert(str(signal.id), str(user_id), "email")
        except Exception as e:
            _log("warning", "Alert delivery failed", signal_id=str(signal.id), error=str(e))
