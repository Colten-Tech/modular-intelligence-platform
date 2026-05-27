import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import select

from app.models.database import Alert, AsyncSessionLocal, Signal as SignalModel, User

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2.0  # seconds


async def send_signal_alert(
    signal_id: str,
    user_id: str,
    channel: str,
) -> bool:
    """
    Send an alert for a given signal via the specified channel.
    Retries up to MAX_RETRIES times with exponential backoff.
    Returns True on success, False on final failure.
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            success = await _dispatch(signal_id, user_id, channel)
            if success:
                await _record_alert(signal_id, user_id, channel)
                return True
        except Exception as exc:
            wait = RETRY_BACKOFF_BASE ** attempt
            logger.warning(
                f"Alert delivery attempt {attempt}/{MAX_RETRIES} failed for signal {signal_id}: {exc}. "
                f"Retrying in {wait}s"
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(wait)

    logger.error(f"Alert delivery permanently failed for signal {signal_id} via {channel}")
    return False


async def _dispatch(signal_id: str, user_id: str, channel: str) -> bool:
    async with AsyncSessionLocal() as db:
        # Load signal
        sig_stmt = select(SignalModel).where(SignalModel.id == uuid.UUID(signal_id))
        sig_result = await db.execute(sig_stmt)
        signal = sig_result.scalar_one_or_none()
        if signal is None:
            logger.error(f"Signal {signal_id} not found for alert delivery")
            return False

        # Load user
        user_stmt = select(User).where(User.id == uuid.UUID(user_id))
        user_result = await db.execute(user_stmt)
        user = user_result.scalar_one_or_none()
        if user is None:
            logger.error(f"User {user_id} not found for alert delivery")
            return False

        if channel == "email":
            return await _send_email_alert(signal, user)
        elif channel == "webhook":
            return await _send_webhook_alert(signal, user)
        else:
            logger.error(f"Unknown alert channel: {channel}")
            return False


async def _send_email_alert(signal, user) -> bool:
    from app.config import settings

    try:
        import resend

        resend.api_key = settings.resend_api_key

        score_pct = int(signal.score * 100)
        html_body = f"""
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a2e;">New Intelligence Signal</h2>
            <div style="background: #f8f9fa; border-left: 4px solid #6c63ff; padding: 16px; margin: 16px 0;">
                <h3 style="margin: 0 0 8px;">{signal.title}</h3>
                <p style="margin: 0; color: #666;">Relevance score: <strong>{score_pct}%</strong></p>
            </div>
            <div style="padding: 16px 0;">
                <p>{signal.body}</p>
            </div>
            {"<p><a href='" + signal.source_url + "'>View Source</a></p>" if signal.source_url else ""}
            <hr style="border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">
                Sent by Modular Intelligence Platform ·
                <a href="{settings.app_url}/signals/{signal.id}">View in app</a>
            </p>
        </div>
        """

        params = resend.Emails.SendParams(
            from_="MIP Alerts <alerts@modular-intelligence.io>",
            to=[user.email],
            subject=f"[MIP Signal] {signal.title[:80]}",
            html=html_body,
        )
        resend.Emails.send(params)
        logger.info(f"Email alert sent for signal {signal.id} to {user.email}")
        return True

    except ImportError:
        logger.error("resend package not installed")
        return False
    except Exception as exc:
        logger.error(f"Email send failed: {exc}")
        raise


async def _send_webhook_alert(signal, user) -> bool:
    # Fetch user's webhook URL from their settings (stored in user metadata)
    # For now, read from signal metadata if present, or user record
    webhook_url = None
    if signal.meta:
        webhook_url = signal.meta.get("webhook_url")

    if not webhook_url:
        logger.warning(f"No webhook URL configured for user {user.id}")
        return False

    payload = {
        "event": "signal.created",
        "signal": {
            "id": str(signal.id),
            "title": signal.title,
            "body": signal.body,
            "score": signal.score,
            "source_url": signal.source_url,
            "metadata": signal.meta,
            "created_at": signal.created_at.isoformat() if signal.created_at else None,
        },
        "user_id": str(user.id),
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            webhook_url,
            json=payload,
            headers={"Content-Type": "application/json", "X-MIP-Event": "signal.created"},
        )
        resp.raise_for_status()
        logger.info(f"Webhook alert sent for signal {signal.id} to {webhook_url}")
        return True


async def _record_alert(signal_id: str, user_id: str, channel: str) -> None:
    async with AsyncSessionLocal() as db:
        alert = Alert(
            id=uuid.uuid4(),
            signal_id=uuid.UUID(signal_id),
            user_id=uuid.UUID(user_id),
            channel=channel,
            sent_at=datetime.now(timezone.utc),
        )
        db.add(alert)
        await db.commit()
