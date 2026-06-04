import logging
import statistics
from datetime import datetime
from typing import Dict, List

from app.core.base_module import BaseModule, Signal

logger = logging.getLogger(__name__)

DEMO_SIGNALS = [
    Signal(
        title="Chronotype Analysis: Intermediate (slight evening bias) — Weekly schedule optimized",
        body=(
            "**Chronotype: Intermediate-Evening**\n"
            "Based on 14 nights of sleep log analysis.\n\n"
            "**Sleep pattern:**\n"
            "- Avg sleep onset: 23:28\n"
            "- Avg wake time: 07:12\n"
            "- Avg duration: 7.7h\n"
            "- Consistency score: 78% (weekend delay: +47 min)\n\n"
            "**Optimized weekly schedule:**\n\n"
            "**Monday–Friday:**\n"
            "- 07:00–08:30 — Admin, email, low-stakes tasks (still ramping up)\n"
            "- 09:30–12:30 — Deep work, creative work, strategic decisions\n"
            "- 13:00–14:30 — Meetings, collaboration, calls\n"
            "- 14:30–15:00 — Post-lunch dip: break or light admin\n"
            "- 15:00–17:30 — Second peak: execution, coding, analysis\n"
            "- 17:30–19:00 — Low cognitive load: reviews, async comms\n\n"
            "**Key insight:** Your peak cognitive window is 09:30–12:30. "
            "Protect this time ruthlessly from meetings."
        ),
        score=0.88,
        source_url=None,
        metadata={
            "chronotype": "intermediate_evening",
            "consistency_score": 78,
            "avg_sleep_duration": 7.7,
            "demo": True,
        },
    ),
]

CHRONOTYPE_PROFILES = {
    "morning": {
        "name": "Morning (Lark)",
        "peak_start": 6,
        "peak_end": 12,
        "description": "Peak performance in early morning, natural early riser",
    },
    "intermediate": {
        "name": "Intermediate",
        "peak_start": 9,
        "peak_end": 14,
        "description": "Flexible chronotype, peak mid-morning to early afternoon",
    },
    "evening": {
        "name": "Evening (Owl)",
        "peak_start": 11,
        "peak_end": 17,
        "description": "Peak performance in late morning and afternoon/evening",
    },
}

TASK_CATEGORY_MAPPING = {
    "deep_work": {"label": "Deep work / focus", "cognitive_load": "high"},
    "meetings": {"label": "Meetings / collaboration", "cognitive_load": "medium"},
    "admin": {"label": "Admin / email", "cognitive_load": "low"},
    "creative": {"label": "Creative work", "cognitive_load": "high"},
    "exercise": {"label": "Exercise", "cognitive_load": "physical"},
}


class ChronotypePlanner(BaseModule):
    module_id = "chronotype-planner"
    display_name = "Chronotype Planner"
    cluster = "health"
    default_schedule = "0 6 * * 1"
    required_plan = "pro"
    description = (
        "Analyzes your sleep log to identify your chronotype, then generates an optimized "
        "weekly schedule that aligns task categories with your cognitive peaks."
    )

    config_schema = {
        "type": "object",
        "properties": {
            "sleep_log": {
                "type": "array",
                "title": "Sleep log entries",
                "description": "Add at least 5 nights of sleep data. Each entry requires a date (YYYY-MM-DD), a sleep time (HH:MM), and a wake time (HH:MM), e.g. {\"date\": \"2024-03-01\", \"sleep_time\": \"23:30\", \"wake_time\": \"07:00\"}.",
                "items": {
                    "type": "object",
                    "properties": {
                        "date": {"type": "string"},
                        "sleep_time": {"type": "string"},
                        "wake_time": {"type": "string"},
                    },
                    "required": ["date", "sleep_time", "wake_time"],
                },
            },
            "task_categories": {
                "type": "array",
                "title": "Task categories to schedule",
                "description": "Select the types of tasks you want the planner to fit into your schedule. Each selected category will be assigned to the optimal time block for your chronotype.",
                "items": {
                    "type": "string",
                    "enum": ["deep_work", "meetings", "admin", "creative", "exercise"],
                },
                "default": ["deep_work", "meetings", "admin"],
            },
        },
    }

    def validate_config(self, config: dict) -> bool:
        return isinstance(config, dict)

    def get_ui_component_hint(self) -> str:
        return "schedule-planner"

    async def run(self, config: dict, db_session, module_instance_id: str = None) -> List[Signal]:
        sleep_log: List[Dict[str, str]] = config.get("sleep_log", [])
        task_categories: List[str] = config.get("task_categories", ["deep_work", "meetings", "admin"])

        if not sleep_log or len(sleep_log) < 5:
            logger.info("chronotype-planner: Insufficient sleep log data, returning demo")
            return DEMO_SIGNALS

        # Parse sleep log
        sleep_hours = []
        wake_hours = []
        durations = []

        for entry in sleep_log:
            try:
                sleep_str = entry.get("sleep_time", "23:00")
                wake_str = entry.get("wake_time", "07:00")

                sleep_h, sleep_m = map(int, sleep_str.split(":"))
                wake_h, wake_m = map(int, wake_str.split(":"))

                sleep_decimal = sleep_h + sleep_m / 60
                wake_decimal = wake_h + wake_m / 60

                # Handle cross-midnight sleep
                if sleep_decimal > 12:  # PM sleep
                    duration = wake_decimal + (24 - sleep_decimal)
                else:
                    duration = wake_decimal - sleep_decimal

                if 3 <= duration <= 14:  # sanity check
                    sleep_hours.append(sleep_decimal)
                    wake_hours.append(wake_decimal)
                    durations.append(duration)
            except (ValueError, AttributeError):
                continue

        if not sleep_hours:
            return DEMO_SIGNALS

        # Compute averages
        avg_sleep = statistics.mean(sleep_hours)
        avg_wake = statistics.mean(wake_hours)
        avg_duration = statistics.mean(durations)

        # Consistency (lower stdev = more consistent)
        wake_consistency = statistics.stdev(wake_hours) if len(wake_hours) > 1 else 0
        consistency_score = max(0, int(100 - wake_consistency * 20))

        # Weekend offset (if date info available)
        weekend_offset = 0
        weekday_wakes = []
        weekend_wakes = []
        for entry in sleep_log:
            try:
                date_obj = datetime.strptime(entry["date"], "%Y-%m-%d")
                wake_str = entry.get("wake_time", "07:00")
                wake_h, wake_m = map(int, wake_str.split(":"))
                wake_dec = wake_h + wake_m / 60
                if date_obj.weekday() < 5:
                    weekday_wakes.append(wake_dec)
                else:
                    weekend_wakes.append(wake_dec)
            except Exception:
                continue

        if weekday_wakes and weekend_wakes:
            weekend_offset = (statistics.mean(weekend_wakes) - statistics.mean(weekday_wakes)) * 60  # minutes

        # Determine chronotype
        if avg_wake < 6.5:
            chronotype = "morning"
        elif avg_wake > 8.5:
            chronotype = "evening"
        else:
            chronotype = "intermediate"

        profile = CHRONOTYPE_PROFILES[chronotype]
        peak_start = profile["peak_start"]
        peak_end = profile["peak_end"]

        # Build optimized schedule
        schedule = self._build_schedule(
            chronotype=chronotype,
            avg_wake=avg_wake,
            peak_start=peak_start,
            peak_end=peak_end,
            task_categories=task_categories,
        )

        body_lines = [
            f"**Chronotype: {profile['name']}**",
            f"Based on {len(sleep_log)} nights of sleep log data.",
            "",
            "**Sleep pattern:**",
            f"- Avg sleep onset: {_decimal_to_time(avg_sleep)}",
            f"- Avg wake time: {_decimal_to_time(avg_wake)}",
            f"- Avg duration: {avg_duration:.1f}h",
            f"- Consistency score: {consistency_score}%",
        ]

        if abs(weekend_offset) > 20:
            body_lines.append(
                f"- Weekend social jetlag: +{weekend_offset:.0f} min later wake "
                f"({'⚠ significant' if abs(weekend_offset) > 60 else '— mild'})"
            )

        body_lines.extend(["", f"**{profile['description']}**", "", "**Optimized daily schedule:**", ""])

        body_lines.extend(schedule)

        body_lines.extend([
            "",
            f"**Key insight:** Your peak cognitive window is {peak_start:02d}:00–{peak_end:02d}:00. "
            "Protect deep work blocks from meetings and interruptions.",
        ])

        return [
            Signal(
                title=f"Chronotype Analysis: {profile['name']} — Weekly schedule generated",
                body="\n".join(body_lines),
                score=0.82,
                source_url=None,
                metadata={
                    "chronotype": chronotype,
                    "consistency_score": consistency_score,
                    "avg_sleep_duration": round(avg_duration, 1),
                    "avg_wake_time": _decimal_to_time(avg_wake),
                    "peak_window": f"{peak_start:02d}:00–{peak_end:02d}:00",
                    "weekend_offset_min": round(weekend_offset, 0) if weekend_offset else None,
                },
            )
        ]

    def _build_schedule(
        self,
        chronotype: str,
        avg_wake: float,
        peak_start: int,
        peak_end: int,
        task_categories: List[str],
    ) -> List[str]:
        wake_h = int(avg_wake)
        schedule_blocks = []

        ramp_up_end = min(wake_h + 1, peak_start)
        schedule_blocks.append(
            f"- {wake_h:02d}:00–{ramp_up_end:02d}:30 — Admin / email / easy tasks (ramp-up phase)"
        )

        # Deep work / creative in peak window
        if "deep_work" in task_categories or "creative" in task_categories:
            schedule_blocks.append(
                f"- {peak_start:02d}:30–{peak_start + 3:02d}:00 — **Deep work / creative** (peak cognitive window)"
            )

        # Meetings mid-day
        if "meetings" in task_categories:
            lunch_h = peak_start + 3
            schedule_blocks.append(f"- {lunch_h:02d}:00–{lunch_h + 1}:00 — Lunch break")
            schedule_blocks.append(f"- {lunch_h + 1:02d}:00–{lunch_h + 3}:00 — Meetings / collaboration")

        # Post-lunch dip
        dip_h = peak_start + 5
        schedule_blocks.append(f"- {dip_h:02d}:00–{dip_h:02d}:30 — Break / low-intensity tasks (post-lunch dip)")

        # Second peak
        second_peak_start = dip_h + 1
        schedule_blocks.append(
            f"- {second_peak_start:02d}:00–{second_peak_start + 2}:00 — Execution / analysis / second focus block"
        )

        # Exercise
        if "exercise" in task_categories:
            if chronotype == "morning":
                schedule_blocks.insert(0, f"- {wake_h:02d}:00–{wake_h + 1:02d}:00 — Exercise (optimal for morning type)")
            else:
                ex_h = second_peak_start + 2
                schedule_blocks.append(f"- {ex_h:02d}:00–{ex_h + 1}:00 — Exercise")

        # Wind down
        schedule_blocks.append("- 19:00–21:00 — Admin wrap-up / async communications")
        schedule_blocks.append("- 21:00+ — Wind down, no screens, prepare for sleep")

        return schedule_blocks


def _decimal_to_time(decimal_hour: float) -> str:
    h = int(decimal_hour) % 24
    m = int((decimal_hour % 1) * 60)
    return f"{h:02d}:{m:02d}"
