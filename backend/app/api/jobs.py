import uuid
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import get_current_user
from app.core.job_runner import execute_module_job
from app.models.database import get_db, Job, Module
from app.models.schemas import JobListResponse, JobLogEntry, JobResponse

router = APIRouter()
logger = logging.getLogger(__name__)

_ERR = lambda msg, code, details=None: {"error": msg, "code": code, "details": details or {}}


def _build_job_response(job: Job, module_type: Optional[str] = None) -> JobResponse:
    duration = None
    if job.started_at and job.finished_at:
        duration = (job.finished_at - job.started_at).total_seconds()
    resp = JobResponse.model_validate(job)
    resp.duration_seconds = duration
    resp.module_type = module_type
    return resp


@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(
    module_id: Optional[uuid.UUID] = Query(None),
    job_status: Optional[str] = Query(None, alias="status"),
    date_from: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List jobs for modules owned by the current user."""
    user_id = uuid.UUID(current_user["id"])

    # Get user's module IDs
    user_modules_stmt = select(Module).where(Module.user_id == user_id)
    mods_result = await db.execute(user_modules_stmt)
    user_mods = {m.id: m.module_type for m in mods_result.scalars().all()}

    if not user_mods:
        return JobListResponse(items=[], total=0, page=page, limit=limit, has_more=False)

    query = select(Job).where(Job.module_id.in_(list(user_mods.keys())))

    if module_id:
        if module_id not in user_mods:
            raise HTTPException(status_code=404, detail=_ERR("Module not found", "MODULE_NOT_FOUND"))
        query = query.where(Job.module_id == module_id)

    if job_status:
        query = query.where(Job.status == job_status)

    if date_from:
        query = query.where(Job.started_at >= date_from)

    # Total
    from sqlalchemy import func, select as sa_select
    count_stmt = sa_select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    query = query.order_by(Job.started_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    jobs = result.scalars().all()

    return JobListResponse(
        items=[_build_job_response(j, user_mods.get(j.module_id)) for j in jobs],
        total=total,
        page=page,
        limit=limit,
        has_more=total > page * limit,
    )


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single job by ID."""
    user_id = uuid.UUID(current_user["id"])

    stmt = (
        select(Job, Module.module_type)
        .join(Module, Job.module_id == Module.id)
        .where(Job.id == job_id, Module.user_id == user_id)
    )
    result = await db.execute(stmt)
    row = result.first()

    if row is None:
        raise HTTPException(status_code=404, detail=_ERR("Job not found", "JOB_NOT_FOUND"))

    job, module_type = row
    return _build_job_response(job, module_type)


@router.get("/jobs/{job_id}/logs", response_model=List[JobLogEntry])
async def get_job_logs(
    job_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return structured logs for a job.
    Since we store logs in the job error field and don't have a separate log table,
    we reconstruct basic log entries from the job record.
    """
    user_id = uuid.UUID(current_user["id"])

    stmt = (
        select(Job, Module.module_type)
        .join(Module, Job.module_id == Module.id)
        .where(Job.id == job_id, Module.user_id == user_id)
    )
    result = await db.execute(stmt)
    row = result.first()

    if row is None:
        raise HTTPException(status_code=404, detail=_ERR("Job not found", "JOB_NOT_FOUND"))

    job, module_type = row

    logs: List[JobLogEntry] = []

    if job.started_at:
        logs.append(
            JobLogEntry(
                timestamp=job.started_at,
                level="INFO",
                message=f"Job started for module '{module_type}'",
                data={"module_id": str(job.module_id)},
            )
        )

    if job.status == "running":
        logs.append(
            JobLogEntry(
                timestamp=datetime.utcnow(),
                level="INFO",
                message="Job is still running",
                data={},
            )
        )
    elif job.status == "success" and job.finished_at:
        logs.append(
            JobLogEntry(
                timestamp=job.finished_at,
                level="INFO",
                message=f"Job completed successfully. Signals found: {job.signals_found}",
                data={"signals_found": job.signals_found},
            )
        )
    elif job.status == "failed" and job.finished_at:
        logs.append(
            JobLogEntry(
                timestamp=job.finished_at,
                level="ERROR",
                message=f"Job failed: {job.error or 'Unknown error'}",
                data={"error": job.error},
            )
        )

    return logs


@router.post("/jobs/{job_id}/retry", status_code=status.HTTP_202_ACCEPTED)
async def retry_job(
    job_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retry a failed job by re-running its module."""
    user_id = uuid.UUID(current_user["id"])

    stmt = (
        select(Job, Module)
        .join(Module, Job.module_id == Module.id)
        .where(Job.id == job_id, Module.user_id == user_id)
    )
    result = await db.execute(stmt)
    row = result.first()

    if row is None:
        raise HTTPException(status_code=404, detail=_ERR("Job not found", "JOB_NOT_FOUND"))

    job, module_row = row

    if job.status not in ("failed", "pending"):
        raise HTTPException(
            status_code=400,
            detail=_ERR(f"Cannot retry job with status '{job.status}'", "INVALID_JOB_STATUS"),
        )

    background_tasks.add_task(execute_module_job, str(module_row.id))
    return {"message": "Job retry triggered", "module_instance_id": str(module_row.id)}
