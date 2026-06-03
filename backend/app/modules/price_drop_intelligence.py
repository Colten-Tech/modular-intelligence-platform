import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

import httpx
from sqlalchemy import select

from app.core.base_module import BaseModule, Signal
from app.core.scraper import scraper_engine
from app.models.database import PriceSnapshot, RawSnapshot
from app.utils.hashing import hash_content
from app.utils.llm import llm_extractor

logger = logging.getLogger(__name__)

DEMO_SIGNALS = [
    Signal(
        title="Notion: Pricing change detected — Plus plan increased from $8 to $10/user/month",
        body=(
            "Notion's Plus plan has increased from $8 to $10/user/month (+25%). "
            "Business plan unchanged at $15/user/month. "
            "Enterprise pricing now requires annual commitment. "
            "Change detected: 2024-01-15. "
            "Impact: ~€24/year additional cost per user. Consider renegotiating or switching to annual billing."
        ),
        score=0.88,
        source_url="https://www.notion.so/pricing",
        metadata={"tool": "Notion", "change_type": "price_increase", "pct_change": 25, "demo": True},
    ),
    Signal(
        title="Linear: New 'Plus' tier added at $8/user/month",
        body=(
            "Linear has introduced a new 'Plus' tier at $8/user/month, sitting between Free and Business. "
            "New tier includes: guest access, advanced integrations, and 10GB storage. "
            "Existing Business plan holders see no change. "
            "This adds a migration path for teams on the free plan."
        ),
        score=0.71,
        source_url="https://linear.app/pricing",
        metadata={"tool": "Linear", "change_type": "new_tier", "demo": True},
    ),
]


class PriceDropIntelligence(BaseModule):
    module_id = "price-drop-intelligence"
    display_name = "Price Drop Intelligence"
    cluster = "b2b-intelligence"
    default_schedule = "0 10 * * *"
    required_plan = "pro"
    description = (
        "Monitors SaaS pricing pages for changes: price increases/decreases, "
        "new tiers, removed plans. Uses AI to classify and quantify changes."
    )

    config_schema = {
        "type": "object",
        "properties": {
            "target_urls": {
                "type": "array",
                "title": "SaaS pricing page URLs to monitor",
                "description": "Add the pricing page URLs for the SaaS tools you want to monitor, e.g. https://www.notion.so/pricing. Enter one URL per entry.",
                "items": {"type": "string"},
            },
            "tool_names": {
                "type": "array",
                "title": "Tool names (parallel to target_urls)",
                "description": "Enter the display name for each tool in the same order as the URLs above, e.g. 'Notion'. This label appears in alerts so you can identify which tool changed.",
                "items": {"type": "string"},
            },
            "alert_threshold": {
                "type": "number",
                "title": "Alert on % price change threshold",
                "description": "Only trigger an alert when a price changes by at least this percentage. For example, 5 means you'll only be notified if a plan price moves by 5% or more.",
                "default": 5,
                "minimum": 0,
                "maximum": 100,
            },
        },
    }

    def validate_config(self, config: dict) -> bool:
        return isinstance(config, dict)

    async def run(self, config: dict, db_session, module_instance_id: str = None) -> List[Signal]:
        target_urls: List[str] = config.get("target_urls", [])
        tool_names: List[str] = config.get("tool_names", [])
        alert_threshold: float = float(config.get("alert_threshold", 5))

        if not target_urls:
            logger.info("price-drop-intelligence: No URLs configured, returning demo signals")
            return DEMO_SIGNALS

        signals: List[Signal] = []
        for idx, url in enumerate(target_urls[:20]):
            tool_name = tool_names[idx] if idx < len(tool_names) else url
            try:
                sig = await self._check_pricing_page(url, tool_name, alert_threshold, db_session)
                if sig:
                    signals.append(sig)
            except Exception as exc:
                logger.warning(f"Failed to check pricing page {url}: {exc}")

        return signals if signals else []

    async def _check_pricing_page(
        self,
        url: str,
        tool_name: str,
        alert_threshold: float,
        db_session,
    ) -> Optional[Signal]:
        try:
            html = await scraper_engine.fetch(url, js_render=True)
        except Exception as exc:
            logger.warning(f"Fetch failed for {url}: {exc}")
            return None

        if not html:
            return None

        current_hash = hash_content(html)

        # Check previous snapshot
        old_html = ""
        if db_session:
            try:
                snap_stmt = (
                    select(PriceSnapshot)
                    .where(PriceSnapshot.url == url)
                    .order_by(PriceSnapshot.captured_at.desc())
                    .limit(1)
                )
                result = await db_session.execute(snap_stmt)
                last_snap = result.scalar_one_or_none()

                if last_snap:
                    # Get associated raw snapshot for old HTML
                    raw_stmt = (
                        select(RawSnapshot)
                        .where(RawSnapshot.url == url)
                        .order_by(RawSnapshot.fetched_at.desc())
                        .limit(2)
                    )
                    raw_result = await db_session.execute(raw_stmt)
                    raws = raw_result.scalars().all()
                    if len(raws) >= 2:
                        old_html = raws[1].raw_html or ""
                    elif len(raws) == 1:
                        old_html = raws[0].raw_html or ""

                    # Skip if content unchanged
                    if last_snap.price_data and last_snap.price_data.get("content_hash") == current_hash:
                        return None

            except Exception as exc:
                logger.warning(f"DB error checking price snapshot: {exc}")

        # Extract pricing data with LLM
        schema = {
            "type": "object",
            "properties": {
                "tiers": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "price_monthly": {"type": "number"},
                            "price_yearly": {"type": "number"},
                            "currency": {"type": "string"},
                            "per": {"type": "string"},
                        },
                        "required": ["name"],
                    },
                },
                "change_detected": {"type": "boolean"},
                "change_type": {
                    "type": "string",
                    "enum": ["price_increase", "price_decrease", "new_tier", "removed_tier", "no_change"],
                },
                "change_summary": {"type": "string"},
                "estimated_pct_change": {"type": "number"},
            },
            "required": ["tiers", "change_detected", "change_type", "change_summary"],
        }

        system_prompt = (
            f"You analyze SaaS pricing pages for {tool_name}. "
            "Extract all pricing tiers with their prices. "
            "If old content is provided, detect and classify any pricing changes. "
            "Estimate percentage change if applicable."
        )

        content = f"CURRENT PRICING PAGE:\n{html[:15000]}"
        if old_html:
            content = f"PREVIOUS PAGE:\n{old_html[:5000]}\n\n{content}"

        extracted = await llm_extractor.extract_structured(content, schema, system_prompt)

        if not extracted:
            return None

        change_detected = extracted.get("change_detected", False)
        if not change_detected and old_html:
            return None

        estimated_pct = abs(float(extracted.get("estimated_pct_change", 0)))
        if old_html and estimated_pct < alert_threshold:
            return None

        change_type = extracted.get("change_type", "no_change")
        change_summary = extracted.get("change_summary", "")

        # Save new price snapshot
        if db_session:
            try:
                ps = PriceSnapshot(
                    id=uuid.uuid4(),
                    module_id=None,
                    url=url,
                    tool_name=tool_name,
                    price_data={
                        "tiers": extracted.get("tiers", []),
                        "content_hash": current_hash,
                    },
                    captured_at=datetime.now(timezone.utc),
                    change_detected=change_detected,
                    change_type=change_type if change_detected else None,
                )
                db_session.add(ps)
                # Also save raw snapshot
                db_session.add(
                    RawSnapshot(
                        id=uuid.uuid4(),
                        module_id=None,
                        url=url,
                        content_hash=current_hash,
                        raw_html=html[:500_000],
                        fetched_at=datetime.now(timezone.utc),
                    )
                )
                await db_session.commit()
            except Exception as exc:
                logger.warning(f"Could not save price snapshot: {exc}")

        score = 0.5
        if change_type == "price_increase":
            score = min(0.5 + estimated_pct / 100, 1.0)
        elif change_type == "price_decrease":
            score = 0.8
        elif change_type in ("new_tier", "removed_tier"):
            score = 0.7

        body_lines = [change_summary]
        tiers = extracted.get("tiers", [])
        if tiers:
            body_lines.append("\nCurrent pricing tiers:")
            for tier in tiers[:5]:
                price_mo = tier.get("price_monthly")
                price_yr = tier.get("price_yearly")
                currency = tier.get("currency", "$")
                per = tier.get("per", "user/month")
                tier_line = f"- **{tier.get('name', 'Tier')}**: "
                if price_mo is not None:
                    tier_line += f"{currency}{price_mo}/{per}"
                if price_yr is not None:
                    tier_line += f" ({currency}{price_yr}/yr)"
                body_lines.append(tier_line)

        return Signal(
            title=f"{tool_name}: {change_summary[:80] if change_summary else 'Pricing change detected'}",
            body="\n".join(body_lines),
            score=score,
            source_url=url,
            metadata={
                "tool": tool_name,
                "change_type": change_type,
                "pct_change": estimated_pct,
                "tiers": tiers,
            },
        )
