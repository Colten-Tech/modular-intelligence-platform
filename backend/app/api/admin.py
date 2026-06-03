"""
Admin API — endpoints accessible only to users with is_admin = TRUE.
All routes require a valid JWT (get_current_user) AND is_admin flag in DB.
"""
import uuid
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import get_current_user
from app.models.database import (
    AsyncSessionLocal,
    Job,
    Module,
    Signal as SignalModel,
    User,
    get_db,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


# ── Admin guard ───────────────────────────────────────────────────────────────

async def require_admin(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Dependency: verifies the authenticated user has is_admin = TRUE in DB."""
    user_id = uuid.UUID(current_user["id"])
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    db_user = result.scalar_one_or_none()
    if db_user is None or not db_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


# ── Schemas ───────────────────────────────────────────────────────────────────

class AdminUserRow(BaseModel):
    id: str
    email: str
    plan: str
    is_admin: bool
    created_at: str
    module_count: int
    signal_count: int

    model_config = {"from_attributes": True}


class AdminOverview(BaseModel):
    total_users: int
    total_signals: int
    total_jobs: int
    active_modules: int
    jobs_last_24h: int
    signals_last_24h: int
    users_by_plan: dict[str, int]


class PlanUpdate(BaseModel):
    plan: str


class AdminToggle(BaseModel):
    is_admin: bool


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/overview", response_model=AdminOverview)
async def admin_overview(
    _admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """System-wide stats for the admin dashboard header."""
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    total_users = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    total_signals = (await db.execute(select(func.count()).select_from(SignalModel))).scalar_one()
    total_jobs = (await db.execute(select(func.count()).select_from(Job))).scalar_one()
    active_modules = (
        await db.execute(select(func.count()).select_from(Module).where(Module.enabled == True))
    ).scalar_one()
    jobs_24h = (
        await db.execute(
            select(func.count()).select_from(Job).where(Job.started_at >= cutoff)
        )
    ).scalar_one()
    signals_24h = (
        await db.execute(
            select(func.count()).select_from(SignalModel).where(SignalModel.created_at >= cutoff)
        )
    ).scalar_one()

    # Users by plan
    plan_rows = (await db.execute(
        select(User.plan, func.count().label("cnt")).group_by(User.plan)
    )).all()
    users_by_plan = {row.plan: row.cnt for row in plan_rows}

    return AdminOverview(
        total_users=total_users,
        total_signals=total_signals,
        total_jobs=total_jobs,
        active_modules=active_modules,
        jobs_last_24h=jobs_24h,
        signals_last_24h=signals_24h,
        users_by_plan=users_by_plan,
    )


@router.get("/users", response_model=list[AdminUserRow])
async def admin_list_users(
    _admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """All users with module + signal counts."""
    # Subquery: module count per user
    module_sub = (
        select(Module.user_id, func.count().label("module_count"))
        .group_by(Module.user_id)
        .subquery()
    )
    # Subquery: signal count per user
    signal_sub = (
        select(SignalModel.user_id, func.count().label("signal_count"))
        .group_by(SignalModel.user_id)
        .subquery()
    )

    stmt = (
        select(
            User,
            func.coalesce(module_sub.c.module_count, 0).label("module_count"),
            func.coalesce(signal_sub.c.signal_count, 0).label("signal_count"),
        )
        .outerjoin(module_sub, User.id == module_sub.c.user_id)
        .outerjoin(signal_sub, User.id == signal_sub.c.user_id)
        .order_by(User.created_at.desc())
    )

    rows = (await db.execute(stmt)).all()

    return [
        AdminUserRow(
            id=str(row.User.id),
            email=row.User.email,
            plan=row.User.plan,
            is_admin=row.User.is_admin,
            created_at=row.User.created_at.isoformat() if row.User.created_at else "",
            module_count=row.module_count,
            signal_count=row.signal_count,
        )
        for row in rows
    ]


@router.patch("/users/{user_id}/plan", response_model=AdminUserRow)
async def admin_update_plan(
    user_id: str,
    body: PlanUpdate,
    _admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Change a user's plan."""
    if body.plan not in ("free", "pro", "team"):
        raise HTTPException(status_code=400, detail="Invalid plan. Must be free, pro, or team.")

    uid = uuid.UUID(user_id)
    stmt = select(User).where(User.id == uid)
    result = await db.execute(stmt)
    db_user = result.scalar_one_or_none()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    db_user.plan = body.plan
    await db.commit()
    await db.refresh(db_user)

    module_count = (
        await db.execute(select(func.count()).select_from(Module).where(Module.user_id == uid))
    ).scalar_one()
    signal_count = (
        await db.execute(select(func.count()).select_from(SignalModel).where(SignalModel.user_id == uid))
    ).scalar_one()

    return AdminUserRow(
        id=str(db_user.id),
        email=db_user.email,
        plan=db_user.plan,
        is_admin=db_user.is_admin,
        created_at=db_user.created_at.isoformat() if db_user.created_at else "",
        module_count=module_count,
        signal_count=signal_count,
    )


@router.patch("/users/{user_id}/admin", response_model=AdminUserRow)
async def admin_toggle_admin(
    user_id: str,
    body: AdminToggle,
    current_admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Grant or revoke admin privileges for a user."""
    # Prevent self-demotion
    if user_id == current_admin["id"] and not body.is_admin:
        raise HTTPException(status_code=400, detail="Cannot revoke your own admin access.")

    uid = uuid.UUID(user_id)
    stmt = select(User).where(User.id == uid)
    result = await db.execute(stmt)
    db_user = result.scalar_one_or_none()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    db_user.is_admin = body.is_admin
    await db.commit()
    await db.refresh(db_user)

    module_count = (
        await db.execute(select(func.count()).select_from(Module).where(Module.user_id == uid))
    ).scalar_one()
    signal_count = (
        await db.execute(select(func.count()).select_from(SignalModel).where(SignalModel.user_id == uid))
    ).scalar_one()

    return AdminUserRow(
        id=str(db_user.id),
        email=db_user.email,
        plan=db_user.plan,
        is_admin=db_user.is_admin,
        created_at=db_user.created_at.isoformat() if db_user.created_at else "",
        module_count=module_count,
        signal_count=signal_count,
    )
