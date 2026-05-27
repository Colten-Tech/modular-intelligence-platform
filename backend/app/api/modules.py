import uuid
import logging
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import get_current_user
from app.core.module_registry import module_registry
from app.core.scheduler import scheduler_instance
from app.core.job_runner import execute_module_job
from app.models.database import get_db, Job, Module, Signal
from app.models.schemas import (
    EnableModuleRequest,
    ModuleConfigUpdate,
    ModuleInfo,
    ModuleResponse,
    ModuleStatusResponse,
    SignalListResponse,
    SignalResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)

_ERR = lambda msg, code, details=None: {"error": msg, "code": code, "details": details or {}}


@router.get("/modules", response_model=List[ModuleInfo])
async def list_modules(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all available modules plus user's enabled ones."""
    user_id = uuid.UUID(current_user["id"])

    # Fetch user's enabled module instances
    stmt = select(Module).where(Module.user_id == user_id)
    result = await db.execute(stmt)
    user_modules = {m.module_type: m for m in result.scalars().all()}

    modules_list: List[ModuleInfo] = []
    for mod in module_registry.list_modules():
        enabled_instance = user_modules.get(mod.module_id)
        modules_list.append(
            ModuleInfo(
                module_id=mod.module_id,
                display_name=mod.display_name,
                description=mod.description,
                cluster=mod.cluster,
                default_schedule=mod.default_schedule,
                required_plan=mod.required_plan,
                config_schema=mod.config_schema,
                ui_component_hint=mod.get_ui_component_hint(),
                enabled=enabled_instance is not None and enabled_instance.enabled,
                instance_id=enabled_instance.id if enabled_instance else None,
                instance_config=enabled_instance.config if enabled_instance else None,
            )
        )

    return modules_list


@router.post("/modules/{module_id}/enable", response_model=ModuleResponse, status_code=status.HTTP_201_CREATED)
async def enable_module(
    module_id: str,
    body: EnableModuleRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enable a module for the current user."""
    mod = module_registry.get_module(module_id)
    if mod is None:
        raise HTTPException(status_code=404, detail=_ERR(f"Module '{module_id}' not found", "MODULE_NOT_FOUND"))

    # Plan check
    plan = current_user.get("plan", "free")
    plan_hierarchy = {"free": 0, "pro": 1, "team": 2}
    required_level = plan_hierarchy.get(mod.required_plan, 0)
    user_level = plan_hierarchy.get(plan, 0)
    if user_level < required_level:
        raise HTTPException(
            status_code=403,
            detail=_ERR(f"Module requires '{mod.required_plan}' plan", "PLAN_REQUIRED"),
        )

    user_id = uuid.UUID(current_user["id"])

    # Check if already enabled
    existing_stmt = select(Module).where(
        Module.user_id == user_id,
        Module.module_type == module_id,
    )
    existing_result = await db.execute(existing_stmt)
    existing = existing_result.scalar_one_or_none()

    if existing:
        if existing.enabled:
            raise HTTPException(
                status_code=409,
                detail=_ERR("Module already enabled", "MODULE_ALREADY_ENABLED"),
            )
        # Re-enable
        existing.enabled = True
        existing.config = body.config or {}
        await db.commit()
        await db.refresh(existing)
        scheduler_instance.schedule_module(
            str(existing.id), module_id, mod.default_schedule, str(user_id)
        )
        return ModuleResponse.model_validate(existing)

    # Validate config
    if body.config and not mod.validate_config(body.config):
        raise HTTPException(
            status_code=422,
            detail=_ERR("Invalid module configuration", "INVALID_CONFIG"),
        )

    module_row = Module(
        id=uuid.uuid4(),
        user_id=user_id,
        module_type=module_id,
        config=body.config or {},
        enabled=True,
    )
    db.add(module_row)
    await db.commit()
    await db.refresh(module_row)

    # Schedule
    scheduler_instance.schedule_module(
        str(module_row.id), module_id, mod.default_schedule, str(user_id)
    )

    return ModuleResponse.model_validate(module_row)


@router.put("/modules/{module_id}/config", response_model=ModuleResponse)
async def update_module_config(
    module_id: str,
    body: ModuleConfigUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update config for an enabled module."""
    mod = module_registry.get_module(module_id)
    if mod is None:
        raise HTTPException(status_code=404, detail=_ERR(f"Module '{module_id}' not found", "MODULE_NOT_FOUND"))

    user_id = uuid.UUID(current_user["id"])
    stmt = select(Module).where(Module.user_id == user_id, Module.module_type == module_id, Module.enabled == True)
    result = await db.execute(stmt)
    module_row = result.scalar_one_or_none()

    if module_row is None:
        raise HTTPException(status_code=404, detail=_ERR("Module not enabled for this user", "MODULE_NOT_ENABLED"))

    if not mod.validate_config(body.config):
        raise HTTPException(status_code=422, detail=_ERR("Invalid configuration", "INVALID_CONFIG"))

    module_row.config = body.config
    await db.commit()
    await db.refresh(module_row)
    return ModuleResponse.model_validate(module_row)


@router.post("/modules/{module_id}/run", status_code=status.HTTP_202_ACCEPTED)
async def trigger_module_run(
    module_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger an immediate module run in the background."""
    user_id = uuid.UUID(current_user["id"])
    stmt = select(Module).where(Module.user_id == user_id, Module.module_type == module_id, Module.enabled == True)
    result = await db.execute(stmt)
    module_row = result.scalar_one_or_none()

    if module_row is None:
        raise HTTPException(status_code=404, detail=_ERR("Module not enabled for this user", "MODULE_NOT_ENABLED"))

    background_tasks.add_task(execute_module_job, str(module_row.id))
    return {"message": "Module run triggered", "module_instance_id": str(module_row.id)}


@router.get("/modules/{module_id}/signals", response_model=SignalListResponse)
async def get_module_signals(
    module_id: str,
    page: int = 1,
    limit: int = 20,
    unread_only: bool = False,
    min_score: float = 0.0,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get paginated signals for a specific module."""
    user_id = uuid.UUID(current_user["id"])

    # Verify module ownership
    mod_stmt = select(Module).where(
        Module.user_id == user_id,
        Module.module_type == module_id,
    )
    mod_result = await db.execute(mod_stmt)
    module_row = mod_result.scalar_one_or_none()

    if module_row is None:
        raise HTTPException(status_code=404, detail=_ERR("Module not found", "MODULE_NOT_FOUND"))

    query = select(Signal).where(
        Signal.module_id == module_row.id,
        Signal.user_id == user_id,
        Signal.archived == False,
        Signal.score >= min_score,
    )
    if unread_only:
        query = query.where(Signal.read == False)

    # Count
    count_stmt = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    query = query.order_by(Signal.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    signals = result.scalars().all()

    return SignalListResponse(
        items=[SignalResponse.model_validate(s) for s in signals],
        total=total,
        page=page,
        limit=limit,
        has_more=total > page * limit,
    )


@router.get("/modules/{module_id}/status", response_model=ModuleStatusResponse)
async def get_module_status(
    module_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get last run, next run, and job counts for a module."""
    user_id = uuid.UUID(current_user["id"])

    stmt = select(Module).where(Module.user_id == user_id, Module.module_type == module_id)
    result = await db.execute(stmt)
    module_row = result.scalar_one_or_none()

    if module_row is None:
        mod = module_registry.get_module(module_id)
        if mod is None:
            raise HTTPException(status_code=404, detail=_ERR("Module not found", "MODULE_NOT_FOUND"))
        return ModuleStatusResponse(module_id=module_id, enabled=False)

    # Job stats
    jobs_stmt = select(Job).where(Job.module_id == module_row.id).order_by(Job.started_at.desc())
    jobs_result = await db.execute(jobs_stmt)
    all_jobs = jobs_result.scalars().all()

    total_jobs = len(all_jobs)
    successful_jobs = sum(1 for j in all_jobs if j.status == "success")
    failed_jobs = sum(1 for j in all_jobs if j.status == "failed")
    last_run = all_jobs[0].started_at if all_jobs else None

    # Signal count
    sig_count_result = await db.execute(
        select(func.count()).where(Signal.module_id == module_row.id, Signal.user_id == user_id)
    )
    total_signals = sig_count_result.scalar_one()

    # Scheduler next run
    sched_status = scheduler_instance.get_job_status(str(module_row.id))
    next_run_str = sched_status.get("next_run")
    from datetime import datetime
    next_run = datetime.fromisoformat(next_run_str) if next_run_str else None

    return ModuleStatusResponse(
        module_id=module_id,
        instance_id=module_row.id,
        enabled=module_row.enabled,
        last_run=last_run,
        next_run=next_run,
        total_jobs=total_jobs,
        successful_jobs=successful_jobs,
        failed_jobs=failed_jobs,
        total_signals=total_signals,
    )


@router.post("/modules/{module_id}/pause", response_model=ModuleResponse)
async def pause_module(
    module_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pause (disable scheduling for) a module without deleting it."""
    user_id = uuid.UUID(current_user["id"])
    stmt = select(Module).where(Module.user_id == user_id, Module.module_type == module_id)
    result = await db.execute(stmt)
    module_row = result.scalar_one_or_none()

    if module_row is None:
        raise HTTPException(status_code=404, detail=_ERR("Module not found", "MODULE_NOT_FOUND"))

    module_row.enabled = False
    scheduler_instance.unschedule_module(str(module_row.id))
    await db.commit()
    await db.refresh(module_row)
    return ModuleResponse.model_validate(module_row)


@router.post("/modules/{module_id}/resume", response_model=ModuleResponse)
async def resume_module(
    module_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resume a paused module."""
    user_id = uuid.UUID(current_user["id"])
    stmt = select(Module).where(Module.user_id == user_id, Module.module_type == module_id)
    result = await db.execute(stmt)
    module_row = result.scalar_one_or_none()

    if module_row is None:
        raise HTTPException(status_code=404, detail=_ERR("Module not found", "MODULE_NOT_FOUND"))

    mod = module_registry.get_module(module_id)
    module_row.enabled = True
    if mod:
        scheduler_instance.schedule_module(
            str(module_row.id), module_id, mod.default_schedule, str(user_id)
        )
    await db.commit()
    await db.refresh(module_row)
    return ModuleResponse.model_validate(module_row)


@router.delete("/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disable_module(
    module_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disable/remove a module for the current user."""
    user_id = uuid.UUID(current_user["id"])
    stmt = select(Module).where(Module.user_id == user_id, Module.module_type == module_id)
    result = await db.execute(stmt)
    module_row = result.scalar_one_or_none()

    if module_row is None:
        raise HTTPException(status_code=404, detail=_ERR("Module not found", "MODULE_NOT_FOUND"))

    module_row.enabled = False
    scheduler_instance.unschedule_module(str(module_row.id))
    await db.commit()
    return None
