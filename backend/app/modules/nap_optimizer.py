import logging
import math
from datetime import datetime, timedelta, timezone  # noqa: F401
from typing import List, Optional

from app.core.base_module import BaseModule, Signal

logger = logging.getLogger(__name__)


class NapOptimizer(BaseModule):
    module_id = "nap-optimizer"
    display_name = "Nap Optimizer"
    cluster = "health"
    default_schedule = "0 12 * * *"
    required_plan = "free"
    description = (
        "Uses the two-process model of sleep (Borbély) to recommend optimal nap windows "
        "based on your wake time and circadian phase."
    )

    config_schema = {
        "type": "object",
        "properties": {
            "typical_sleep_time": {
                "type": "string",
                "title": "Typical bedtime (HH:MM)",
                "description": "Enter the time you usually fall asleep in 24-hour format, e.g. '23:00' for 11 PM. This is used to model your sleep pressure cycle.",
                "default": "23:00",
            },
            "typical_wake_time": {
                "type": "string",
                "title": "Typical wake time (HH:MM)",
                "description": "Enter the time you typically wake up in 24-hour format, e.g. '07:00'. This anchors your circadian phase for nap window calculations.",
                "default": "07:00",
            },
            "avoid_after": {
                "type": "string",
                "title": "Avoid napping after this time (HH:MM)",
                "description": "Set the latest time you're willing to nap in 24-hour format, e.g. '15:00'. Napping after this time can disrupt your evening sleep onset.",
                "default": "15:00",
            },
        },
    }

    def validate_config(self, config: dict) -> bool:
        if not isinstance(config, dict):
            return False
        for field in ("typical_sleep_time", "typical_wake_time", "avoid_after"):
            if field in config:
                val = config[field]
                if not isinstance(val, str) or len(val) != 5 or val[2] != ":":
                    return False
        return True

    def get_ui_component_hint(self) -> str:
        return "nap-optimizer"

    async def run(self, config: dict, db_session, module_instance_id: str = None) -> List[Signal]:
        import math

        now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC for time arithmetic
        # Two-process model of sleep (Borbély)
        # Process S: homeostatic sleep pressure, rises since waking
        # Process C: circadian alertness, cosine-based 24h cycle

        wake_time_str = config.get("typical_wake_time", "07:00")
        wake_h, wake_m = map(int, wake_time_str.split(":"))
        wake_dt = now.replace(hour=wake_h, minute=wake_m, second=0, microsecond=0)
        if wake_dt > now:
            wake_dt -= timedelta(days=1)

        hours_since_wake = (now - wake_dt).total_seconds() / 3600

        # Circadian trough typically 14:00-16:00
        # Best nap window: 1-3pm, or 7-8 hours after waking
        optimal_nap_hour = wake_h + 7.5
        if optimal_nap_hour >= 24:
            optimal_nap_hour -= 24

        # Sleep inertia risk: avoid >30 min naps (enter deep sleep)
        # Optimal: 10-20 min (Stage 2) or 90 min (full cycle)

        nap_start = now.replace(
            hour=int(optimal_nap_hour),
            minute=int((optimal_nap_hour % 1) * 60),
            second=0,
        )
        if nap_start < now:
            nap_start += timedelta(hours=1)  # next opportunity

        avoid_after_str = config.get("avoid_after", "15:00")
        avoid_h, avoid_m = map(int, avoid_after_str.split(":"))
        avoid_dt = now.replace(hour=avoid_h, minute=avoid_m)

        if nap_start > avoid_dt:
            body = (
                f"No optimal nap window available today — too close to your avoid-after time "
                f"({avoid_after_str}). Consider a 5-minute eyes-closed rest instead."
            )
            nap_start = None
            duration = 0
            score = 0.3
        else:
            duration = 20  # minutes
            nap_end = nap_start + timedelta(minutes=duration)
            body = (
                f"Optimal nap window: {nap_start.strftime('%H:%M')}–{nap_end.strftime('%H:%M')} ({duration} min)\n\n"
                f"**Why:** You've been awake {hours_since_wake:.1f} hours. Your circadian alertness dip peaks around "
                f"{int(optimal_nap_hour):02d}:00. A {duration}-min Stage 2 nap avoids sleep inertia and restores "
                f"alertness for 2–4 hours.\n\n"
                f"**Avoid napping after {avoid_after_str}** — this preserves your evening sleep pressure."
            )
            score = 0.85

        return [
            Signal(
                title=f"Today's nap recommendation: {nap_start.strftime('%H:%M') if nap_start else 'None available'}",
                body=body,
                score=score,
                source_url=None,
                metadata={
                    "nap_start": nap_start.isoformat() if nap_start else None,
                    "duration_min": duration,
                    "hours_since_wake": round(hours_since_wake, 1),
                    "circadian_phase": "dip" if 13 <= int(optimal_nap_hour) <= 16 else "custom",
                },
            )
        ]
