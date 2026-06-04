import uuid
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.middleware import get_current_user
from app.models.database import get_db, Module, Signal
from app.models.schemas import SignalListResponse, SignalResponse

router = APIRouter()
logger = logging.getLogger(__name__)

def _err(msg: str, code: str, details: dict | None = None) -> dict:
    return {"error": msg, "code": code, "details": details or {}}


@router.get("/signals", response_model=SignalListResponse)
async def get_signals_feed(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    min_score: float = Query(0.0, ge=0.0, le=1.0),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    search: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Unified signal feed with filtering and pagination."""
    user_id = uuid.UUID(current_user["id"])

    query = select(Signal).where(
        Signal.user_id == user_id,
        Signal.archived.is_(False),
        Signal.score >= min_score,
    )

    if unread_only:
        query = query.where(Signal.read.is_(False))

    if date_from:
        query = query.where(Signal.created_at >= date_from)

    if date_to:
        query = query.where(Signal.created_at <= date_to)

    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Signal.title.ilike(search_term),
                Signal.body.ilike(search_term),
            )
        )

    # Total count
    count_stmt = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    # Paginated results
    query = query.order_by(Signal.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    signals = result.scalars().all()

    # Enrich with module_type
    module_ids = {s.module_id for s in signals}
    module_types: dict = {}
    if module_ids:
        mods_result = await db.execute(select(Module).where(Module.id.in_(module_ids)))
        for m in mods_result.scalars().all():
            module_types[m.id] = m.module_type

    items = []
    for s in signals:
        sig_data = SignalResponse.model_validate(s)
        sig_data.module_type = module_types.get(s.module_id)
        items.append(sig_data)

    return SignalListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        has_more=total > page * limit,
    )


@router.get("/signals/{signal_id}", response_model=SignalResponse)
async def get_signal_detail(
    signal_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single signal by ID."""
    user_id = uuid.UUID(current_user["id"])
    stmt = select(Signal).where(Signal.id == signal_id, Signal.user_id == user_id)
    result = await db.execute(stmt)
    signal = result.scalar_one_or_none()

    if signal is None:
        raise HTTPException(status_code=404, detail=_err("Signal not found", "SIGNAL_NOT_FOUND"))

    # Auto-mark as read on detail view
    if not signal.read:
        signal.read = True
        await db.commit()
        await db.refresh(signal)

    return SignalResponse.model_validate(signal)


@router.post("/signals/{signal_id}/read", status_code=status.HTTP_200_OK)
async def mark_signal_read(
    signal_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a signal as read."""
    user_id = uuid.UUID(current_user["id"])
    stmt = select(Signal).where(Signal.id == signal_id, Signal.user_id == user_id)
    result = await db.execute(stmt)
    signal = result.scalar_one_or_none()

    if signal is None:
        raise HTTPException(status_code=404, detail=_err("Signal not found", "SIGNAL_NOT_FOUND"))

    signal.read = True
    await db.commit()
    return {"id": str(signal_id), "read": True}


@router.post("/signals/{signal_id}/archive", status_code=status.HTTP_200_OK)
async def archive_signal(
    signal_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Archive a signal."""
    user_id = uuid.UUID(current_user["id"])
    stmt = select(Signal).where(Signal.id == signal_id, Signal.user_id == user_id)
    result = await db.execute(stmt)
    signal = result.scalar_one_or_none()

    if signal is None:
        raise HTTPException(status_code=404, detail=_err("Signal not found", "SIGNAL_NOT_FOUND"))

    signal.archived = True
    signal.read = True
    await db.commit()
    return {"id": str(signal_id), "archived": True}
