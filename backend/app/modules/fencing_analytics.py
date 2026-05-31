import logging
import statistics
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from app.core.base_module import BaseModule, Signal
from app.models.database import FencingBout

logger = logging.getLogger(__name__)

DEMO_SIGNALS = [
    Signal(
        title="Fencing Analytics: 68% win rate this month — Touch efficiency declining",
        body=(
            "**Monthly Performance Summary (Foil)**\n\n"
            "**Record:** 17W – 8L (68% win rate)\n"
            "**Touch ratio (scored/conceded):** 1.34:1 (improvement: +0.18 from last month)\n"
            "**Avg score differential:** +3.2 touches per bout\n\n"
            "**Action type breakdown:**\n"
            "- Attack: 42% (hit rate: 61%)\n"
            "- Parry-Riposte: 28% (hit rate: 74%) ← strongest action\n"
            "- Counter-attack: 18% (hit rate: 39%) ← weakest action\n"
            "- Flèche: 7% (hit rate: 55%)\n"
            "- Other: 5%\n\n"
            "**Score progression:** Strong starts (1–5 touches: +72%), weak finishes (10–15: +41%). "
            "Fatigue pattern suggests conditioning work needed.\n\n"
            "**Coach note:** Focus on counter-attack technique — hit rate well below threshold. "
            "Consider drill sessions specifically for last-5-touch scenarios."
        ),
        score=0.84,
        source_url=None,
        metadata={
            "weapon": "foil",
            "win_rate": 0.68,
            "touch_ratio": 1.34,
            "bouts": 25,
            "demo": True,
        },
    ),
]


class FencingAnalytics(BaseModule):
    module_id = "fencing-analytics"
    display_name = "Fencing Analytics"
    cluster = "sports"
    default_schedule = "0 20 * * *"
    required_plan = "free"
    description = (
        "Aggregates bout data to compute win rates, touch ratios, action type breakdowns, "
        "and score progression patterns. Generates coach-ready insights."
    )

    config_schema = {
        "type": "object",
        "properties": {
            "weapon": {
                "type": "string",
                "title": "Weapon",
                "description": "Select the fencing weapon you compete with. Analytics and action-type breakdowns are tailored to the chosen weapon.",
                "enum": ["foil", "epee", "sabre"],
                "default": "foil",
            },
            "track_opponents": {
                "type": "boolean",
                "title": "Track opponent-specific stats",
                "description": "Enable to include per-opponent win/loss records in your report for opponents you've faced 3 or more times.",
                "default": True,
            },
            "export_to_coach": {
                "type": "boolean",
                "title": "Format output for coach sharing",
                "description": "Enable to append a coach-friendly footer to the report with a timestamp, making it easy to copy and share with your coach.",
                "default": False,
            },
        },
    }

    def validate_config(self, config: dict) -> bool:
        return isinstance(config, dict)

    def get_ui_component_hint(self) -> str:
        return "fencing-dashboard"

    async def run(self, config: dict, db_session) -> List[Signal]:
        weapon: str = config.get("weapon", "foil")
        track_opponents: bool = config.get("track_opponents", True)
        export_to_coach: bool = config.get("export_to_coach", False)

        if db_session is None:
            return DEMO_SIGNALS

        # Fetch all bouts for this user
        try:
            stmt = select(FencingBout).order_by(FencingBout.date.desc()).limit(200)
            result = await db_session.execute(stmt)
            bouts = result.scalars().all()
        except Exception as exc:
            logger.warning(f"DB query failed for fencing bouts: {exc}")
            return DEMO_SIGNALS

        if not bouts:
            logger.info("fencing-analytics: No bout data found, returning demo")
            return DEMO_SIGNALS

        return self._compute_analytics(bouts, weapon, track_opponents, export_to_coach)

    def _compute_analytics(
        self,
        bouts: List[FencingBout],
        weapon: str,
        track_opponents: bool,
        export_to_coach: bool,
    ) -> List[Signal]:
        total = len(bouts)
        wins = sum(1 for b in bouts if b.result == "win")
        losses = sum(1 for b in bouts if b.result == "loss")
        draws = sum(1 for b in bouts if b.result == "draw")
        win_rate = wins / total if total > 0 else 0

        # Touch statistics
        my_scores = [b.my_score for b in bouts if b.my_score is not None]
        opp_scores = [b.opp_score for b in bouts if b.opp_score is not None]

        avg_my = statistics.mean(my_scores) if my_scores else 0
        avg_opp = statistics.mean(opp_scores) if opp_scores else 0
        touch_ratio = avg_my / avg_opp if avg_opp > 0 else 1.0
        avg_diff = avg_my - avg_opp

        # Score progression — analyze first vs last 5 touches
        early_wins = 0
        late_wins = 0
        early_bouts_counted = 0
        late_bouts_counted = 0

        for bout in bouts:
            action_log = bout.action_log or {}
            if not action_log:
                continue
            # Expected format: {"actions": [{"touch": 1, "scorer": "me|opp", "type": "..."}]}
            actions = action_log.get("actions", [])
            if len(actions) < 10:
                continue
            early_me = sum(1 for a in actions[:5] if a.get("scorer") == "me")
            late_me = sum(1 for a in actions[-5:] if a.get("scorer") == "me")
            early_wins += early_me
            late_wins += late_me
            early_bouts_counted += 1
            late_bouts_counted += 1

        early_efficiency = early_wins / (early_bouts_counted * 5) if early_bouts_counted > 0 else None
        late_efficiency = late_wins / (late_bouts_counted * 5) if late_bouts_counted > 0 else None

        # Action type breakdown
        action_type_stats: Dict[str, Dict[str, int]] = {}
        for bout in bouts:
            action_log = bout.action_log or {}
            for action in action_log.get("actions", []):
                action_type = action.get("type", "other")
                scorer = action.get("scorer", "")
                if action_type not in action_type_stats:
                    action_type_stats[action_type] = {"total": 0, "hits": 0}
                action_type_stats[action_type]["total"] += 1
                if scorer == "me":
                    action_type_stats[action_type]["hits"] += 1

        # Opponent analysis
        opponent_stats: Dict[str, Dict[str, Any]] = {}
        if track_opponents:
            for bout in bouts:
                opp = bout.opponent or "Unknown"
                if opp not in opponent_stats:
                    opponent_stats[opp] = {"bouts": 0, "wins": 0, "my_scores": [], "opp_scores": []}
                opponent_stats[opp]["bouts"] += 1
                if bout.result == "win":
                    opponent_stats[opp]["wins"] += 1
                if bout.my_score is not None:
                    opponent_stats[opp]["my_scores"].append(bout.my_score)
                if bout.opp_score is not None:
                    opponent_stats[opp]["opp_scores"].append(bout.opp_score)

        # Monthly breakdown
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0)
        month_bouts = [b for b in bouts if b.date and b.date >= month_start.date()]
        month_wins = sum(1 for b in month_bouts if b.result == "win")
        month_wr = month_wins / len(month_bouts) if month_bouts else 0

        # Build body
        body_lines = [
            f"**{weapon.capitalize()} — Performance Report**",
            f"Total bouts analyzed: {total}",
            "",
            "**Overall Record:**",
            f"- Win/Loss/Draw: {wins}W – {losses}L – {draws}D ({win_rate:.0%} win rate)",
            f"- Avg score: {avg_my:.1f} vs {avg_opp:.1f} (ratio: {touch_ratio:.2f}:1)",
            f"- Avg point differential: {avg_diff:+.1f} touches per bout",
        ]

        if month_bouts:
            body_lines.extend([
                "",
                f"**This month ({len(month_bouts)} bouts):**",
                f"- Record: {month_wins}W – {len(month_bouts) - month_wins}L ({month_wr:.0%})",
            ])

        if action_type_stats:
            body_lines.extend(["", "**Action type breakdown:**"])
            total_actions = sum(v["total"] for v in action_type_stats.values())
            for action_type, stats in sorted(
                action_type_stats.items(), key=lambda x: x[1]["total"], reverse=True
            )[:6]:
                pct = stats["total"] / total_actions * 100 if total_actions > 0 else 0
                hit_rate = stats["hits"] / stats["total"] if stats["total"] > 0 else 0
                body_lines.append(
                    f"- {action_type.replace('_', '-').title()}: {pct:.0f}% of actions (hit rate: {hit_rate:.0%})"
                )

        if early_efficiency is not None and late_efficiency is not None:
            body_lines.extend([
                "",
                "**Score progression:**",
                f"- Early touches (1–5): {early_efficiency:.0%} efficiency",
                f"- Late touches (last 5): {late_efficiency:.0%} efficiency",
            ])
            if late_efficiency < early_efficiency - 0.15:
                body_lines.append("⚠ Significant late-bout performance drop — conditioning work recommended")

        if track_opponents and opponent_stats:
            recurring = {k: v for k, v in opponent_stats.items() if v["bouts"] >= 3}
            if recurring:
                body_lines.extend(["", "**Recurring opponents (3+ bouts):**"])
                for opp, stats in sorted(recurring.items(), key=lambda x: x[1]["bouts"], reverse=True)[:5]:
                    opp_wr = stats["wins"] / stats["bouts"]
                    body_lines.append(
                        f"- {opp}: {stats['wins']}W – {stats['bouts'] - stats['wins']}L ({opp_wr:.0%})"
                    )

        if export_to_coach:
            body_lines.extend([
                "",
                "---",
                "_Report generated by Modular Intelligence Platform — Fencing Analytics_",
                f"_Exported: {now.strftime('%Y-%m-%d %H:%M UTC')}_",
            ])

        score = 0.6 + min(total / 50 * 0.3, 0.3)

        return [
            Signal(
                title=f"Fencing Analytics: {win_rate:.0%} win rate | {touch_ratio:.2f}:1 touch ratio ({total} bouts)",
                body="\n".join(body_lines),
                score=score,
                source_url=None,
                metadata={
                    "weapon": weapon,
                    "win_rate": round(win_rate, 3),
                    "touch_ratio": round(touch_ratio, 3),
                    "total_bouts": total,
                    "avg_diff": round(avg_diff, 2),
                },
            )
        ]
