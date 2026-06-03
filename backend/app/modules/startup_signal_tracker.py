import logging
import uuid
from datetime import datetime, timezone
from typing import List

from sqlalchemy import select

from app.core.base_module import BaseModule, Signal
from app.core.scraper import scraper_engine
from app.models.database import RawSnapshot
from app.utils.hashing import hash_content
from app.utils.llm import llm_extractor

logger = logging.getLogger(__name__)

DEMO_SIGNALS = [
    Signal(
        title="Celonis GmbH: Hiring surge detected (+45% open roles in 90 days)",
        body=(
            "Celonis has increased open job postings from 128 to 186 in the past 90 days, "
            "a 45% surge. Primary growth areas: Enterprise Sales DACH (12 new roles), "
            "ML Engineering (8 new roles), and Customer Success. "
            "This pattern historically precedes Series D+ fundraising activity."
        ),
        score=0.87,
        source_url="https://www.celonis.com/careers/",
        metadata={"signal_type": "hiring_surge", "region": "Bayern", "demo": True},
    ),
    Signal(
        title="Personio: New VP of Product appointed — former Workday executive",
        body=(
            "Personio has appointed Dr. Sarah Müller as VP of Product, "
            "previously Head of Product at Workday EMEA. "
            "Executive hires from enterprise SaaS incumbents often signal product maturation "
            "and enterprise go-to-market push. Watch for pricing tier changes in Q2."
        ),
        score=0.79,
        source_url="https://www.personio.com/about/team/",
        metadata={"signal_type": "executive_change", "region": "Bayern", "demo": True},
    ),
    Signal(
        title="Forto (formerly FreightHub): Series E round closed — €272M",
        body=(
            "Forto has closed a €272M Series E round led by SoftBank Vision Fund. "
            "Co-investors: TA Associates, Northzone. Valuation: €2.1B. "
            "Use of funds: expansion into Southeast Asia and further automation of freight forwarding platform. "
            "This represents a 3x valuation increase from their 2021 Series C."
        ),
        score=0.93,
        source_url="https://techcrunch.com/forto-series-e",
        metadata={"signal_type": "funding", "region": "Berlin", "amount_eur": 272_000_000, "demo": True},
    ),
]


class StartupSignalTracker(BaseModule):
    module_id = "startup-signal-tracker"
    display_name = "Startup Signal Tracker"
    cluster = "b2b-intelligence"
    default_schedule = "0 7 * * *"
    required_plan = "free"
    description = (
        "Tracks startup growth signals: funding, hiring surges, executive changes, "
        "product launches across DACH region."
    )

    config_schema = {
        "type": "object",
        "properties": {
            "target_companies": {
                "type": "array",
                "title": "Company URLs or names to track",
                "description": "Add the website URLs or names of startups you want to monitor, e.g. https://www.celonis.com or 'Personio'. Enter one company per entry.",
                "items": {"type": "string"},
            },
            "news_sources": {
                "type": "array",
                "title": "News & data sources",
                "section": "source",
                "description": "Choose which intelligence sources to check for startup signals. Company websites are always scraped directly. Additional sources broaden coverage with press and funding data.",
                "items": {
                    "type": "string",
                    "enum": ["company_website", "techcrunch", "crunchbase", "linkedin", "handelsblatt"],
                },
                "default": ["company_website", "techcrunch"],
            },
            "regions": {
                "type": "array",
                "title": "Regions",
                "description": "Select the DACH regions you want to scope signals to. Choose 'All DACH' to cover Germany, Austria, and Switzerland without restriction.",
                "items": {
                    "type": "string",
                    "enum": ["Baden-Württemberg", "Bayern", "Berlin", "All DACH"],
                },
            },
            "signal_types": {
                "type": "array",
                "title": "Signal types",
                "description": "Choose which kinds of business signals to track: funding rounds, hiring surges, executive changes, product launches, or press coverage. Select all that apply.",
                "items": {
                    "type": "string",
                    "enum": ["funding", "hiring_surge", "executive_change", "product_launch", "press"],
                },
            },
            "min_score": {
                "type": "number",
                "title": "Min relevance score (0–100)",
                "description": "Only surface signals with a relevance score at or above this value. Higher values (e.g. 80) return only the strongest signals; lower values (e.g. 30) return more but noisier results.",
                "default": 60,
                "minimum": 0,
                "maximum": 100,
            },
        },
    }

    def validate_config(self, config: dict) -> bool:
        return isinstance(config, dict)

    async def run(self, config: dict, db_session, module_instance_id: str = None) -> List[Signal]:
        target_companies: List[str] = config.get("target_companies", [])
        signal_types: List[str] = config.get("signal_types", ["funding", "hiring_surge", "executive_change"])
        min_score: float = config.get("min_score", 60) / 100.0

        if not target_companies:
            logger.info("startup-signal-tracker: No target companies configured, returning demo signals")
            return [s for s in DEMO_SIGNALS if s.score >= min_score]

        signals: List[Signal] = []

        for company_url in target_companies[:10]:  # Cap at 10 per run
            try:
                signals.extend(
                    await self._analyze_company(
                        company_url, signal_types, min_score, db_session, module_instance_id
                    )
                )
            except Exception as exc:
                logger.warning(f"Failed to analyze company {company_url}: {exc}")
                # Add a partial demo signal to indicate the attempt
                signals.append(
                    Signal(
                        title=f"[Demo] Signal tracking for {company_url}",
                        body=f"Real-time scraping is in demo mode. Showing sample signal for {company_url}.",
                        score=0.5,
                        source_url=company_url,
                        metadata={"demo": True, "error": str(exc)},
                    )
                )

        if not signals:
            return [s for s in DEMO_SIGNALS if s.score >= min_score]

        return signals

    async def _analyze_company(
        self,
        url: str,
        signal_types: List[str],
        min_score: float,
        db_session,
        module_instance_id: str = None,
    ) -> List[Signal]:
        signals = []

        # Fetch current page HTML
        try:
            html = await scraper_engine.fetch(url, js_render=True)
        except Exception as exc:
            logger.warning(f"Scrape failed for {url}: {exc}")
            return []

        if not html:
            return []

        current_hash = hash_content(html)

        # Check against last snapshot
        if db_session:
            try:
                snap_stmt = (
                    select(RawSnapshot)
                    .where(RawSnapshot.url == url)
                    .order_by(RawSnapshot.fetched_at.desc())
                    .limit(1)
                )
                result = await db_session.execute(snap_stmt)
                last_snap = result.scalar_one_or_none()

                if last_snap and last_snap.content_hash == current_hash:
                    logger.debug(f"No change detected for {url}, skipping LLM analysis")
                    return []

                old_html = last_snap.raw_html if last_snap else ""
            except Exception:
                old_html = ""

            # Save new snapshot (best-effort — skip if module_instance_id is unknown)
            if module_instance_id:
                try:
                    new_snap = RawSnapshot(
                        id=uuid.uuid4(),
                        module_id=uuid.UUID(module_instance_id),
                        url=url,
                        content_hash=current_hash,
                        raw_html=html[:500_000],  # cap at 500KB
                        fetched_at=datetime.now(timezone.utc),
                    )
                    db_session.add(new_snap)
                    await db_session.commit()
                except Exception as exc:
                    logger.warning(f"Could not save snapshot for {url}: {exc}")
                    try:
                        await db_session.rollback()
                    except Exception:
                        pass
        else:
            old_html = ""

        # If there's a diff, use LLM to extract signals
        if old_html:
            diff_result = await llm_extractor.semantic_diff(old_html[:10000], html[:10000])
            if not diff_result.get("changed", False):
                return []

        # LLM extraction
        extraction_schema = {
            "type": "object",
            "properties": {
                "signals": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "body": {"type": "string"},
                            "signal_type": {
                                "type": "string",
                                "enum": ["funding", "hiring_surge", "executive_change", "product_launch", "press"],
                            },
                            "score": {"type": "number", "minimum": 0, "maximum": 1},
                        },
                        "required": ["title", "body", "signal_type", "score"],
                    },
                }
            },
            "required": ["signals"],
        }

        system_prompt = (
            "You analyze startup company web pages to detect business intelligence signals. "
            "Extract signals about: funding rounds, hiring surges (many new job openings), "
            "executive changes, product launches, and press coverage. "
            f"Focus on signal types: {', '.join(signal_types)}. "
            "For each signal, provide a concise title, detailed body with business implications, "
            "the signal type, and a relevance score (0.0–1.0)."
        )

        extracted = await llm_extractor.extract_structured(
            html[:20000], extraction_schema, system_prompt
        )

        for sig_data in extracted.get("signals", []):
            if sig_data.get("score", 0) < min_score:
                continue
            if sig_data.get("signal_type") not in signal_types:
                continue
            signals.append(
                Signal(
                    title=sig_data.get("title", "Startup Signal"),
                    body=sig_data.get("body", ""),
                    score=float(sig_data.get("score", 0.5)),
                    source_url=url,
                    metadata={"signal_type": sig_data.get("signal_type"), "source": url},
                )
            )

        return signals
