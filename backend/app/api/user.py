import uuid
import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import get_current_user
from app.models.database import get_db, Job, Module, Signal, User
from app.models.schemas import UserSettings, UserStats

router = APIRouter()
logger = logging.getLogger(__name__)

_ERR = lambda msg, code, details=None: {"error": msg, "code": code, "details": details or {}}

# In a real app, user settings would be stored in a separate table.
# Here we use a simple in-memory dict as a placeholder (per-user, server-scoped).
_user_settings_store: Dict[str, Dict[str, Any]] = {}


def _default_settings() -> Dict[str, Any]:
    return {
        "alert_email": None,
        "webhook_url": None,
        "alert_channels": ["email"],
        "min_alert_score": 0.7,
        "timezone": "UTC",
        "notification_frequency": "realtime",
    }


@router.get("/user/me")
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return DB-level user info including is_admin.

    Auto-creates the user row on first login so the DB stays in sync with
    Supabase Auth — this is safe to call multiple times (upsert behaviour).
    """
    user_id = uuid.UUID(current_user["id"])
    result = await db.execute(select(User).where(User.id == user_id))
    db_user = result.scalar_one_or_none()

    if db_user is None:
        # First time this user has hit the API — create their DB row.
        db_user = User(
            id=user_id,
            email=current_user.get("email", ""),
            plan="free",
            is_admin=False,
        )
        db.add(db_user)
        await db.commit()
        await db.refresh(db_user)
        logger.info(f"Auto-created user row for {db_user.email}")

    return {
        "id": str(db_user.id),
        "email": db_user.email,
        "plan": db_user.plan,
        "is_admin": db_user.is_admin,
        "created_at": db_user.created_at.isoformat() if db_user.created_at else "",
    }


@router.get("/stats", response_model=UserStats)
@router.get("/user/stats", response_model=UserStats)
async def get_user_stats(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return usage statistics for the current user."""
    from datetime import datetime, timedelta, timezone

    user_id = uuid.UUID(current_user["id"])
    plan = current_user.get("plan", "free")
    plan_limits = {"free": 2, "pro": 14, "team": 14}
    modules_limit = plan_limits.get(plan, 2)

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)

    # Active enabled modules
    mods_result = await db.execute(
        select(Module).where(Module.user_id == user_id, Module.enabled == True)
    )
    enabled_modules = mods_result.scalars().all()
    module_ids = [m.id for m in enabled_modules]
    active_modules = len(enabled_modules)

    # Signals today
    today_sigs = await db.execute(
        select(func.count()).where(Signal.user_id == user_id, Signal.created_at >= today_start)
    )
    signals_today = today_sigs.scalar_one()

    # Signals this week
    week_sigs = await db.execute(
        select(func.count()).where(Signal.user_id == user_id, Signal.created_at >= week_ago)
    )
    signals_this_week = week_sigs.scalar_one()

    # Total signals
    total_sigs = await db.execute(select(func.count()).where(Signal.user_id == user_id))
    total_signals = total_sigs.scalar_one()

    # Unread signals
    unread_sigs = await db.execute(
        select(func.count()).where(Signal.user_id == user_id, Signal.read == False, Signal.archived == False)
    )
    unread_signals = unread_sigs.scalar_one()

    # Jobs today + success rate
    jobs_today = 0
    success_rate = 0.0
    if module_ids:
        today_jobs_result = await db.execute(
            select(Job).where(Job.module_id.in_(module_ids), Job.started_at >= today_start)
        )
        today_jobs = today_jobs_result.scalars().all()
        jobs_today = len(today_jobs)
        if jobs_today > 0:
            success_count = sum(1 for j in today_jobs if j.status == "success")
            success_rate = round((success_count / jobs_today) * 100, 1)

    return UserStats(
        signals_today=signals_today,
        signals_this_week=signals_this_week,
        active_modules=active_modules,
        jobs_today=jobs_today,
        success_rate=success_rate,
        modules_limit=modules_limit,
        total_signals=total_signals,
        unread_signals=unread_signals,
        plan=plan,
    )


@router.get("/settings", response_model=UserSettings)
@router.get("/user/settings", response_model=UserSettings)
async def get_user_settings(
    current_user: dict = Depends(get_current_user),
):
    """Get user alert and notification settings."""
    user_id = current_user["id"]
    raw = _user_settings_store.get(user_id, _default_settings())
    return UserSettings(**raw)


@router.patch("/settings", response_model=UserSettings)
@router.put("/user/settings", response_model=UserSettings)
async def update_user_settings(
    body: UserSettings,
    current_user: dict = Depends(get_current_user),
):
    """Update user alert and notification settings."""
    user_id = current_user["id"]
    _user_settings_store[user_id] = body.model_dump()
    return body
