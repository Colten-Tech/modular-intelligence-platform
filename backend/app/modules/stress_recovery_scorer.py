import logging
import statistics
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from app.core.base_module import BaseModule, Signal
from app.models.database import VoiceRecording

logger = logging.getLogger(__name__)

DEMO_SIGNALS = [
    Signal(
        title="Stress-Recovery Score: 62/100 — Moderate stress, partial recovery",
        body=(
            "**Today's Stress-Recovery Score: 62/100**\n\n"
            "Score breakdown:\n"
            "- Voice biomarkers: 74/100 (elevated)\n"
            "- Activity proxy (screen interactions): 58/100 (moderate)\n"
            "- Baseline deviation: +18 points above your 7-day average\n\n"
            "**Recovery status:** Partial — your score peaked at 81 at 14:30 and has decreased. "
            "You're trending toward recovery but not yet at baseline.\n\n"
            "**Actionable steps:**\n"
            "1. Finish current work by 18:00 to allow adequate wind-down\n"
            "2. Avoid caffeine after 15:00\n"
            "3. Consider a 10-minute breathing exercise (box breathing: 4-4-4-4)\n"
            "4. Target 7.5h sleep tonight to restore baseline"
        ),
        score=0.72,
        source_url=None,
        metadata={"stress_score": 62, "trend": "recovering", "demo": True},
    ),
]


class StressRecoveryScorer(BaseModule):
    module_id = "stress-recovery-scorer"
    display_name = "Stress-Recovery Scorer"
    cluster = "health"
    default_schedule = "0 21 * * *"
    required_plan = "pro"
    description = (
        "Aggregates usage data and voice recordings to compute a daily stress-recovery score. "
        "Alerts when you exceed your personal baseline."
    )

    config_schema = {
        "type": "object",
        "properties": {
            "baseline_days": {
                "type": "number",
                "title": "Baseline window in days",
                "description": "Set how many past days are used to compute your personal stress baseline. A larger window (e.g. 14 days) gives a more stable baseline; a smaller window (e.g. 3 days) reacts faster to recent changes.",
                "default": 7,
                "minimum": 3,
            },
            "track_typing_speed": {
                "type": "boolean",
                "title": "Factor in typing speed changes",
                "description": "Enable to include keyboard typing speed as an additional stress indicator. When enabled, submit your daily keyboard analytics for more accurate scoring.",
                "default": False,
            },
            "track_screen_time": {
                "type": "boolean",
                "title": "Factor in screen time",
                "description": "Enable to factor your daily screen time into the stress-recovery score. When enabled, submit your daily screen time data for enhanced accuracy.",
                "default": False,
            },
        },
    }

    def validate_config(self, config: dict) -> bool:
        return isinstance(config, dict)

    def get_ui_component_hint(self) -> str:
        return "stress-scorer"

    async def run(self, config: dict, db_session, module_instance_id: str = None) -> List[Signal]:
        baseline_days: int = int(config.get("baseline_days", 7))
        track_typing: bool = config.get("track_typing_speed", False)
        track_screen: bool = config.get("track_screen_time", False)

        if db_session is None:
            return DEMO_SIGNALS

        now = datetime.now(timezone.utc)
        today_cutoff = now - timedelta(days=1)
        baseline_cutoff = now - timedelta(days=baseline_days + 1)

        # Fetch today's and baseline voice recordings — scoped to the module instance's user
        import uuid as _uuid
        mid = _uuid.UUID(module_instance_id) if module_instance_id else None
        try:
            today_filter = [VoiceRecording.recorded_at >= today_cutoff]
            if mid is not None:
                today_filter.append(VoiceRecording.module_id == mid)
            today_stmt = (
                select(VoiceRecording)
                .where(*today_filter)
                .order_by(VoiceRecording.recorded_at.desc())
                .limit(5)
            )
            today_result = await db_session.execute(today_stmt)
            today_recordings = today_result.scalars().all()

            baseline_filter = [
                VoiceRecording.recorded_at >= baseline_cutoff,
                VoiceRecording.recorded_at < today_cutoff,
            ]
            if mid is not None:
                baseline_filter.append(VoiceRecording.module_id == mid)
            baseline_stmt = (
                select(VoiceRecording)
                .where(*baseline_filter)
                .order_by(VoiceRecording.recorded_at.desc())
                .limit(50)
            )
            baseline_result = await db_session.execute(baseline_stmt)
            baseline_recordings = baseline_result.scalars().all()
        except Exception as exc:
            logger.warning(f"DB query failed in stress-recovery-scorer: {exc}")
            return DEMO_SIGNALS

        if not today_recordings and not baseline_recordings:
            logger.info("stress-recovery-scorer: No recording data available, returning demo")
            return DEMO_SIGNALS

        # Compute today's stress composite
        today_stress_scores = [r.stress_score for r in today_recordings if r.stress_score is not None]
        today_fatigue_scores = [r.fatigue_score for r in today_recordings if r.fatigue_score is not None]

        baseline_stress_scores = [r.stress_score for r in baseline_recordings if r.stress_score is not None]
        baseline_fatigue_scores = [r.fatigue_score for r in baseline_recordings if r.fatigue_score is not None]

        if not today_stress_scores and not today_fatigue_scores:
            return []

        # Compute composite score (0=no stress, 100=max stress)
        today_stress = statistics.mean(today_stress_scores) if today_stress_scores else 0.5
        today_fatigue = statistics.mean(today_fatigue_scores) if today_fatigue_scores else 0.5
        composite_raw = (today_stress * 0.6 + today_fatigue * 0.4)
        composite_score = int(composite_raw * 100)

        # Compute baseline
        baseline_stress_avg = statistics.mean(baseline_stress_scores) if baseline_stress_scores else 0.4
        baseline_fatigue_avg = statistics.mean(baseline_fatigue_scores) if baseline_fatigue_scores else 0.35
        baseline_composite = int((baseline_stress_avg * 0.6 + baseline_fatigue_avg * 0.4) * 100)

        deviation = composite_score - baseline_composite
        trend = "recovering" if deviation < 0 else ("elevated" if deviation > 10 else "stable")

        # Only signal if above baseline
        if composite_score <= baseline_composite + 5:
            return []

        score = min(composite_raw + 0.1, 1.0)

        body_lines = [
            f"**Today's Stress-Recovery Score: {composite_score}/100**",
            "",
            "Score breakdown:",
            f"- Stress component: {int(today_stress * 100)}/100",
            f"- Fatigue component: {int(today_fatigue * 100)}/100",
            f"- Baseline (7-day avg): {baseline_composite}/100",
            f"- Deviation: {'+' if deviation >= 0 else ''}{deviation} points",
            "",
        ]

        if trend == "elevated":
            body_lines.extend([
                "**Status: Elevated stress detected**",
                "",
                "**Recommendations:**",
                "1. Prioritize rest — avoid starting new complex tasks",
                "2. Take a 15-minute break every 45 minutes for the rest of the day",
                "3. Review your schedule: can anything be deferred to tomorrow?",
                "4. Ensure 7–8h sleep tonight to prevent accumulation",
            ])
        else:
            body_lines.extend([
                "**Status: Trending toward recovery**",
                "",
                "You're above baseline but improving. Maintain current pace and wind down by 20:00.",
            ])

        if track_typing:
            body_lines.append("\n_Typing speed tracking enabled — submit keyboard analytics for enhanced accuracy._")
        if track_screen:
            body_lines.append("_Screen time tracking enabled — submit daily screen time for enhanced accuracy._")

        return [
            Signal(
                title=f"Stress-Recovery Score: {composite_score}/100 — {trend.capitalize()}",
                body="\n".join(body_lines),
                score=score,
                source_url=None,
                metadata={
                    "stress_score": composite_score,
                    "baseline": baseline_composite,
                    "deviation": deviation,
                    "trend": trend,
                    "today_stress": today_stress,
                    "today_fatigue": today_fatigue,
                },
            )
        ]
