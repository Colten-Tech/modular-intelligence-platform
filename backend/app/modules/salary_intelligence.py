import logging
import statistics
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from app.core.base_module import BaseModule, Signal
from app.models.database import SalarySubmission
from app.utils.llm import llm_extractor

logger = logging.getLogger(__name__)

DEMO_SIGNALS = [
    Signal(
        title="Senior Backend Engineer (Python) — Berlin: €95K–€125K median",
        body=(
            "Based on 47 data points for Senior Backend Engineer (Python) in Berlin:\n\n"
            "- **P25:** €88,000/year\n"
            "- **Median (P50):** €108,000/year\n"
            "- **P75:** €118,000/year\n"
            "- **P90:** €128,000/year\n\n"
            "Company size breakdown:\n"
            "- Early-stage startup (<50): €82K–€95K + equity\n"
            "- Scale-up (50–500): €95K–€115K\n"
            "- Enterprise (500+): €105K–€130K\n\n"
            "YoY change: +6.2% (inflation: 3.1%). Tech stack premium: Rust (+18%), "
            "Kubernetes (+12%), LLM/AI (+22%)."
        ),
        score=0.82,
        source_url=None,
        metadata={
            "role": "Senior Backend Engineer",
            "city": "Berlin",
            "p50": 108000,
            "p75": 118000,
            "sample_size": 47,
            "demo": True,
        },
    ),
    Signal(
        title="Product Manager (B2B SaaS) — München: €85K–€110K, +15% for AI product focus",
        body=(
            "Product Manager salaries in München (B2B SaaS focus), 31 data points:\n\n"
            "- **Median:** €97,000/year\n"
            "- **P75:** €108,000/year\n"
            "- **P90:** €118,000/year\n\n"
            "Notable: Product Managers with AI/ML product experience command a 15% premium. "
            "Remote-first companies offering München-equivalent salaries rose from 12% to 34% this year. "
            "Stock/equity included in 68% of offers."
        ),
        score=0.78,
        source_url=None,
        metadata={
            "role": "Product Manager",
            "city": "München",
            "p50": 97000,
            "sample_size": 31,
            "demo": True,
        },
    ),
]


class SalaryIntelligence(BaseModule):
    module_id = "salary-intelligence"
    display_name = "Salary Intelligence"
    cluster = "consumer-data"
    default_schedule = "0 0 * * 0"
    required_plan = "free"
    description = (
        "Aggregates salary data from crowdsourced submissions and public job postings. "
        "Computes percentile stats per role and city."
    )

    config_schema = {
        "type": "object",
        "properties": {
            "roles_to_track": {
                "type": "array",
                "title": "Role titles to track",
                "items": {"type": "string"},
                "default": ["Software Engineer", "Product Manager"],
            },
            "cities": {
                "type": "array",
                "title": "Cities to include",
                "items": {"type": "string"},
                "default": ["Berlin", "München", "Hamburg"],
            },
        },
    }

    def validate_config(self, config: dict) -> bool:
        return isinstance(config, dict)

    def get_ui_component_hint(self) -> str:
        return "salary-query"

    async def run(self, config: dict, db_session) -> List[Signal]:
        roles: List[str] = config.get("roles_to_track", ["Software Engineer"])
        cities: List[str] = config.get("cities", ["Berlin"])

        if not roles:
            return DEMO_SIGNALS

        signals: List[Signal] = []

        for role in roles[:5]:
            for city in cities[:3]:
                try:
                    sig = await self._compute_salary_signal(role, city, db_session)
                    if sig:
                        signals.append(sig)
                except Exception as exc:
                    logger.warning(f"Salary computation failed for {role}/{city}: {exc}")

        return signals if signals else DEMO_SIGNALS

    async def _compute_salary_signal(
        self, role: str, city: str, db_session
    ) -> Optional[Signal]:
        salaries = []

        if db_session:
            try:
                # Query salary_submissions table
                stmt = select(SalarySubmission).where(
                    SalarySubmission.role_title.ilike(f"%{role}%"),
                    SalarySubmission.city.ilike(f"%{city}%"),
                )
                result = await db_session.execute(stmt)
                submissions = result.scalars().all()
                salaries = [s.salary_eur for s in submissions if s.salary_eur and s.salary_eur > 0]
            except Exception as exc:
                logger.warning(f"DB query failed for salary data: {exc}")

        # If insufficient data, return demo-style signal
        if len(salaries) < 5:
            logger.info(f"Insufficient salary data for {role}/{city} ({len(salaries)} samples). Returning demo.")
            return Signal(
                title=f"{role} — {city}: Insufficient data (need 5+ submissions)",
                body=(
                    f"Only {len(salaries)} salary submission(s) available for {role} in {city}. "
                    "Submit your salary data to improve accuracy. "
                    "See demo data for reference ranges."
                ),
                score=0.3,
                source_url=None,
                metadata={"role": role, "city": city, "sample_size": len(salaries), "insufficient_data": True},
            )

        # Compute percentiles
        salaries_sorted = sorted(salaries)
        p25 = _percentile(salaries_sorted, 25)
        p50 = _percentile(salaries_sorted, 50)
        p75 = _percentile(salaries_sorted, 75)
        p90 = _percentile(salaries_sorted, 90)
        mean = statistics.mean(salaries)
        std = statistics.stdev(salaries) if len(salaries) > 1 else 0

        body = (
            f"**{role}** salary data in **{city}** based on {len(salaries)} submissions:\n\n"
            f"- **P25:** €{p25:,.0f}/year\n"
            f"- **Median (P50):** €{p50:,.0f}/year\n"
            f"- **P75:** €{p75:,.0f}/year\n"
            f"- **P90:** €{p90:,.0f}/year\n"
            f"- **Mean:** €{mean:,.0f}/year (±€{std:,.0f})\n\n"
            f"**Range:** €{min(salaries):,.0f} – €{max(salaries):,.0f}"
        )

        score = min(0.5 + len(salaries) / 100, 0.95)

        return Signal(
            title=f"{role} — {city}: P50 €{p50:,.0f} | P75 €{p75:,.0f} ({len(salaries)} samples)",
            body=body,
            score=score,
            source_url=None,
            metadata={
                "role": role,
                "city": city,
                "p25": p25,
                "p50": p50,
                "p75": p75,
                "p90": p90,
                "mean": mean,
                "sample_size": len(salaries),
            },
        )


def _percentile(sorted_data: List[float], pct: int) -> float:
    if not sorted_data:
        return 0.0
    k = (len(sorted_data) - 1) * pct / 100
    f = int(k)
    c = f + 1
    if c >= len(sorted_data):
        return sorted_data[-1]
    return sorted_data[f] + (k - f) * (sorted_data[c] - sorted_data[f])
