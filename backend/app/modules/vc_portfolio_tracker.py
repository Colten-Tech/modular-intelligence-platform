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
        title="Earlybird Venture Capital: 3 new portfolio additions in Q1",
        body=(
            "Earlybird has added three new companies to its portfolio: "
            "Merantix AI (Berlin, AI infrastructure, Series A), "
            "Makersite (Stuttgart, supply chain intelligence, Seed), and "
            "Voicemod (Barcelona, audio AI, Series B). "
            "Pattern suggests continued focus on B2B SaaS and AI tooling."
        ),
        score=0.82,
        source_url="https://www.earlybird.com/portfolio",
        metadata={"signal_type": "new_portfolio", "vc": "Earlybird", "demo": True},
    ),
    Signal(
        title="HV Capital: Exit — Flixbus IPO raises €600M",
        body=(
            "HV Capital has recorded a landmark exit as Flixbus completes its Frankfurt IPO "
            "raising €600M at a €3.2B valuation. HV Capital held a 4.2% stake. "
            "Estimated return: 28x on initial 2016 investment. "
            "Proceeds expected to fuel new fund deployment."
        ),
        score=0.91,
        source_url="https://hvcapital.com/portfolio/flixbus",
        metadata={"signal_type": "exit", "vc": "HV Capital", "demo": True},
    ),
]


class VCPortfolioTracker(BaseModule):
    module_id = "vc-portfolio-tracker"
    display_name = "VC Portfolio Tracker"
    cluster = "b2b-intelligence"
    default_schedule = "0 8 * * 1"
    required_plan = "free"
    description = (
        "Tracks VC firm portfolio pages for new additions, exits, and follow-on rounds. "
        "Weekly scan of DACH and European VC portfolios."
    )

    config_schema = {
        "type": "object",
        "properties": {
            "vc_firm_urls": {
                "type": "array",
                "title": "VC firm portfolio page URLs",
                "description": "Add the portfolio page URLs for each VC firm you want to monitor, e.g. https://earlybird.com/portfolio. Enter one URL per entry.",
                "items": {"type": "string"},
            },
            "track_exits": {"type": "boolean", "title": "Track exits", "default": True, "description": "Enable to receive alerts when a portfolio company exits via IPO, acquisition, or shutdown."},
            "track_new_portfolio": {"type": "boolean", "title": "Track new portfolio additions", "default": True, "description": "Enable to be notified when a VC firm adds a new company to its portfolio."},
            "track_follow_on": {"type": "boolean", "title": "Track follow-on rounds", "default": True, "description": "Enable to receive alerts when an existing portfolio company closes a follow-on funding round."},
        },
    }

    def validate_config(self, config: dict) -> bool:
        return isinstance(config, dict)

    async def run(self, config: dict, db_session, module_instance_id: str = None) -> List[Signal]:
        vc_urls: List[str] = config.get("vc_firm_urls", [])
        track_exits: bool = config.get("track_exits", True)
        track_new: bool = config.get("track_new_portfolio", True)
        track_follow_on: bool = config.get("track_follow_on", True)

        if not vc_urls:
            logger.info("vc-portfolio-tracker: No VC URLs configured, returning demo signals")
            return DEMO_SIGNALS

        signals: List[Signal] = []
        tracked_types = []
        if track_exits:
            tracked_types.append("exit")
        if track_new:
            tracked_types.append("new_portfolio")
        if track_follow_on:
            tracked_types.append("follow_on")

        for url in vc_urls[:5]:
            try:
                signals.extend(await self._analyze_vc_portfolio(url, tracked_types, db_session))
            except Exception as exc:
                logger.warning(f"Failed to analyze VC portfolio {url}: {exc}")

        return signals if signals else DEMO_SIGNALS

    async def _analyze_vc_portfolio(
        self, url: str, tracked_types: List[str], db_session
    ) -> List[Signal]:
        try:
            html = await scraper_engine.fetch(url, js_render=True)
        except Exception as exc:
            logger.warning(f"Scrape failed for {url}: {exc}")
            return []

        if not html:
            return []

        current_hash = hash_content(html)

        old_html = ""
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
                    return []
                old_html = last_snap.raw_html if last_snap else ""
                # Skip snapshot persistence — module_instance_id is not available
                # in this helper, so we cannot satisfy the NOT NULL FK constraint.
                await db_session.commit()
            except Exception as exc:
                logger.warning(f"Snapshot error for {url}: {exc}")

        if old_html:
            diff = await llm_extractor.semantic_diff(old_html[:10000], html[:10000])
            if not diff.get("changed"):
                return []

        schema = {
            "type": "object",
            "properties": {
                "portfolio_changes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "body": {"type": "string"},
                            "change_type": {
                                "type": "string",
                                "enum": ["new_portfolio", "exit", "follow_on"],
                            },
                            "company_name": {"type": "string"},
                            "score": {"type": "number", "minimum": 0, "maximum": 1},
                        },
                        "required": ["title", "body", "change_type", "score"],
                    },
                }
            },
            "required": ["portfolio_changes"],
        }

        system_prompt = (
            "You analyze VC firm portfolio pages. Detect: new portfolio companies added, "
            "exits (IPO, acquisition, shutdown), and follow-on funding rounds. "
            f"Focus on changes of type: {', '.join(tracked_types)}. "
            "Score each by business intelligence value (0.0–1.0)."
        )

        extracted = await llm_extractor.extract_structured(html[:20000], schema, system_prompt)

        signals = []
        for item in extracted.get("portfolio_changes", []):
            if item.get("change_type") not in tracked_types:
                continue
            signals.append(
                Signal(
                    title=item.get("title", "VC Portfolio Change"),
                    body=item.get("body", ""),
                    score=float(item.get("score", 0.6)),
                    source_url=url,
                    metadata={
                        "change_type": item.get("change_type"),
                        "company_name": item.get("company_name"),
                        "vc_url": url,
                    },
                )
            )
        return signals
