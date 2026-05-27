"""
Celery worker + beat scheduler for async job processing.
Usage:
  Worker: celery -A app.worker worker --loglevel=info --concurrency=4
  Beat:   celery -A app.worker beat --loglevel=info
"""

import asyncio
import logging

from celery import Celery
from celery.schedules import crontab

from app.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "mip",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.worker.run_module_job": {"queue": "jobs"},
        "app.worker.sync_all_schedules": {"queue": "celery"},
    },
)


def _run_async(coro):
    """Run an async coroutine in a new event loop (for Celery tasks)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    name="app.worker.run_module_job",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
)
def run_module_job(self, module_instance_id: str):
    """
    Execute a single module job.
    Called by APScheduler (via scheduler.py) or triggered manually via the API.
    """
    logger.info(f"Celery task: run_module_job for module_instance_id={module_instance_id}")
    from app.core.job_runner import execute_module_job

    job_id = _run_async(execute_module_job(module_instance_id))
    if job_id is None:
        raise RuntimeError(f"Job execution failed for module_instance_id={module_instance_id}")
    return {"job_id": job_id, "module_instance_id": module_instance_id}


@celery_app.task(name="app.worker.sync_all_schedules")
def sync_all_schedules():
    """
    Periodic task: re-sync all enabled module schedules from DB into APScheduler.
    Runs every 5 minutes as a safety net to catch any drift.
    """
    from app.core.scheduler import scheduler_instance
    from app.models.database import AsyncSessionLocal, Module
    from sqlalchemy import select

    async def _sync():
        async with AsyncSessionLocal() as db:
            stmt = select(Module).where(Module.enabled == True)
            result = await db.execute(stmt)
            modules = result.scalars().all()
            logger.info(f"Syncing {len(modules)} enabled modules into scheduler")
            for mod_row in modules:
                from app.core.module_registry import module_registry
                mod_def = module_registry.get_module(mod_row.module_type)
                if mod_def is None:
                    continue
                schedule = mod_row.schedule or mod_def.default_schedule
                scheduler_instance.schedule_module(
                    str(mod_row.id),
                    mod_row.module_type,
                    schedule,
                    str(mod_row.user_id),
                )

    _run_async(_sync())


# Beat schedule: periodic background tasks
celery_app.conf.beat_schedule = {
    "sync-schedules-every-5min": {
        "task": "app.worker.sync_all_schedules",
        "schedule": crontab(minute="*/5"),
    },
}
