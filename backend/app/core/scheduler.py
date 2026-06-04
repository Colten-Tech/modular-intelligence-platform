import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)


class MIPScheduler:
    def __init__(self):
        self._scheduler = AsyncIOScheduler(timezone="UTC")

    def start(self) -> None:
        if not self._scheduler.running:
            self._scheduler.start()
            logger.info("APScheduler started")

    def shutdown(self) -> None:
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)
            logger.info("APScheduler stopped")

    def schedule_module(
        self,
        module_instance_id: str,
        module_id: str,
        cron_expr: str,
        user_id: str,
    ) -> None:
        """Add or replace a scheduled job for a module instance."""
        job_id = f"module:{module_instance_id}"

        # Remove existing job if present
        if self._scheduler.get_job(job_id):
            self._scheduler.remove_job(job_id)

        # Parse cron expression: "min hour dom mon dow"
        parts = cron_expr.strip().split()
        if len(parts) != 5:
            logger.error(f"Invalid cron expression '{cron_expr}' for module {module_instance_id}")
            return

        minute, hour, day, month, day_of_week = parts
        trigger = CronTrigger(
            minute=minute,
            hour=hour,
            day=day,
            month=month,
            day_of_week=day_of_week,
            timezone="UTC",
        )

        # Import here to avoid circular imports at module load time
        from app.core.job_runner import execute_module_job

        self._scheduler.add_job(
            execute_module_job,
            trigger=trigger,
            id=job_id,
            args=[module_instance_id],
            kwargs={},
            replace_existing=True,
            misfire_grace_time=3600,
            coalesce=True,
            name=f"{module_id} ({user_id})",
        )
        logger.info(f"Scheduled module {module_instance_id} with cron '{cron_expr}'")

    def unschedule_module(self, module_instance_id: str) -> None:
        job_id = f"module:{module_instance_id}"
        job = self._scheduler.get_job(job_id)
        if job:
            self._scheduler.remove_job(job_id)
            logger.info(f"Unscheduled module {module_instance_id}")

    def get_job_status(self, module_instance_id: str) -> dict:
        job_id = f"module:{module_instance_id}"
        job = self._scheduler.get_job(job_id)
        if not job:
            return {"scheduled": False, "next_run": None, "last_run": None}
        return {
            "scheduled": True,
            "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
            "last_run": None,  # APScheduler doesn't track last run by default
        }

    @property
    def running(self) -> bool:
        return self._scheduler.running


scheduler_instance = MIPScheduler()
