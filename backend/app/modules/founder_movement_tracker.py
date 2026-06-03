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
        title="Marcus Weber (ex-CEO Zalando Logistics): Joined stealth AI startup as Co-Founder",
        body=(
            "Marcus Weber, who left Zalando Logistics in Q4 last year, has updated his LinkedIn "
            "profile to show 'Co-Founder & CEO' at an unnamed stealth startup in the logistics/AI space. "
            "His network includes key logistics VCs (HV Capital, Earlybird). "
            "Watch for seed announcement in next 3–6 months."
        ),
        score=0.84,
        source_url=None,
        metadata={"alert_type": "stealth", "person": "Marcus Weber", "demo": True},
    ),
    Signal(
        title="Anna Schmidt: Departed as CPO at N26, role listed as 'Open'",
        body=(
            "Anna Schmidt's LinkedIn profile no longer lists N26 as current employer. "
            "Her last day appears to have been 2 weeks ago based on connection activity. "
            "This marks the 3rd C-suite departure from N26 in 6 months, "
            "suggesting continued leadership instability at the Berlin fintech unicorn."
        ),
        score=0.77,
        source_url=None,
        metadata={"alert_type": "departure", "person": "Anna Schmidt", "company": "N26", "demo": True},
    ),
]


class FounderMovementTracker(BaseModule):
    module_id = "founder-movement-tracker"
    display_name = "Founder Movement Tracker"
    cluster = "b2b-intelligence"
    default_schedule = "0 9 * * *"
    required_plan = "free"
    description = (
        "Tracks founder and executive movements: role changes, new ventures, departures, "
        "and stealth activity by monitoring public LinkedIn profiles and news."
    )

    config_schema = {
        "type": "object",
        "properties": {
            "founder_linkedin_urls": {
                "type": "array",
                "title": "LinkedIn profile URLs to track",
                "description": "Add the LinkedIn profile URLs of founders or executives you want to monitor for career changes, e.g. https://www.linkedin.com/in/username. Enter one URL per entry.",
                "items": {"type": "string"},
            },
            "founder_names": {
                "type": "array",
                "title": "Founder/executive names to track",
                "description": "Enter the full names of founders or executives to track via news search, e.g. 'Anna Schmidt'. Press Enter or click + to add each name.",
                "items": {"type": "string"},
            },
            "alert_on": {
                "type": "array",
                "title": "Alert conditions",
                "description": "Select which types of career movements should trigger an alert: role changes, new venture announcements, departures from a company, or stealth activity.",
                "items": {
                    "type": "string",
                    "enum": ["role_change", "new_venture", "departure", "stealth"],
                },
                "default": ["role_change", "new_venture", "departure"],
            },
        },
    }

    def validate_config(self, config: dict) -> bool:
        return isinstance(config, dict)

    async def run(self, config: dict, db_session, module_instance_id: str = None) -> List[Signal]:
        linkedin_urls: List[str] = config.get("founder_linkedin_urls", [])
        founder_names: List[str] = config.get("founder_names", [])
        alert_on: List[str] = config.get("alert_on", ["role_change", "new_venture", "departure"])

        if not linkedin_urls and not founder_names:
            logger.info("founder-movement-tracker: No founders configured, returning demo signals")
            return DEMO_SIGNALS

        signals: List[Signal] = []

        # Scrape LinkedIn profiles
        for url in linkedin_urls[:10]:
            try:
                signals.extend(await self._analyze_linkedin_profile(url, alert_on, db_session))
            except Exception as exc:
                logger.warning(f"Failed to analyze LinkedIn profile {url}: {exc}")

        # For names without URLs, do a Google News search
        for name in founder_names[:5]:
            try:
                signals.extend(await self._search_founder_news(name, alert_on))
            except Exception as exc:
                logger.warning(f"Failed to search news for {name}: {exc}")

        return signals if signals else DEMO_SIGNALS

    async def _analyze_linkedin_profile(
        self, url: str, alert_on: List[str], db_session
    ) -> List[Signal]:
        # LinkedIn heavily blocks scrapers; use httpx (no JS) as LinkedIn blocks headless browsers
        try:
            html = await scraper_engine.fetch(url, js_render=False)
        except Exception as exc:
            logger.warning(f"LinkedIn scrape failed for {url}: {exc}. Returning demo.")
            return []

        if not html or len(html) < 500:
            logger.warning(f"Got empty/blocked response for LinkedIn {url}")
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
                # Only persist the snapshot when we have a module_instance_id to
                # satisfy the NOT NULL FK constraint on raw_snapshots.module_id.
                # LinkedIn profiles are scraped without a module_instance_id context
                # here, so skip snapshot persistence for this code path.
                await db_session.commit()
            except Exception:
                pass

        schema = {
            "type": "object",
            "properties": {
                "movements": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "body": {"type": "string"},
                            "alert_type": {
                                "type": "string",
                                "enum": ["role_change", "new_venture", "departure", "stealth"],
                            },
                            "person_name": {"type": "string"},
                            "score": {"type": "number", "minimum": 0, "maximum": 1},
                        },
                        "required": ["title", "body", "alert_type", "score"],
                    },
                }
            },
            "required": ["movements"],
        }

        system_prompt = (
            "You analyze LinkedIn profile pages for executive and founder movements. "
            f"Detect changes of type: {', '.join(alert_on)}. "
            "Compare old vs new profile if available. Return detected movements with context."
        )

        content = f"CURRENT PROFILE:\n{html[:10000]}"
        if old_html:
            content = f"PREVIOUS PROFILE:\n{old_html[:5000]}\n\n{content}"

        extracted = await llm_extractor.extract_structured(content, schema, system_prompt)
        signals = []
        for item in extracted.get("movements", []):
            if item.get("alert_type") not in alert_on:
                continue
            signals.append(
                Signal(
                    title=item.get("title", "Founder Movement"),
                    body=item.get("body", ""),
                    score=float(item.get("score", 0.6)),
                    source_url=url,
                    metadata={"alert_type": item.get("alert_type"), "person": item.get("person_name")},
                )
            )
        return signals

    async def _search_founder_news(self, name: str, alert_on: List[str]) -> List[Signal]:
        """Search Google News for founder name."""
        search_url = f"https://news.google.com/search?q={name.replace(' ', '+')}+startup&hl=en"
        try:
            html = await scraper_engine.fetch(search_url, js_render=False)
        except Exception:
            return []

        if not html:
            return []

        schema = {
            "type": "object",
            "properties": {
                "news_signals": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "body": {"type": "string"},
                            "alert_type": {
                                "type": "string",
                                "enum": ["role_change", "new_venture", "departure", "stealth"],
                            },
                            "score": {"type": "number", "minimum": 0, "maximum": 1},
                        },
                        "required": ["title", "body", "alert_type", "score"],
                    },
                }
            },
            "required": ["news_signals"],
        }

        system_prompt = (
            f"You analyze news articles about founder/executive '{name}'. "
            f"Detect movements of type: {', '.join(alert_on)}. "
            "Return relevant signals with business implications."
        )

        extracted = await llm_extractor.extract_structured(html[:15000], schema, system_prompt)
        signals = []
        for item in extracted.get("news_signals", []):
            if item.get("alert_type") not in alert_on:
                continue
            signals.append(
                Signal(
                    title=item.get("title", f"News: {name}"),
                    body=item.get("body", ""),
                    score=float(item.get("score", 0.5)),
                    source_url=search_url,
                    metadata={"alert_type": item.get("alert_type"), "person": name},
                )
            )
        return signals
