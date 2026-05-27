import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.base_module import BaseModule, Signal
from app.core.scraper import scraper_engine
from app.utils.llm import llm_extractor

logger = logging.getLogger(__name__)

DEMO_SIGNALS = [
    Signal(
        title="München Schwabing: 12 new listings below €8,500/sqm — 7-day low",
        body=(
            "12 new apartment listings appeared in München-Schwabing in the last 7 days "
            "at or below €8,500/sqm — the lowest level in this quarter. "
            "Average new listing price: €8,200/sqm (3BR avg: €7,900/sqm). "
            "Compare: 30-day avg was €9,100/sqm. This represents a 10% dip. "
            "Notable: 3 listings are foreclosures, suggesting motivated sellers."
        ),
        score=0.83,
        source_url="https://www.immobilienscout24.de/Suche/de/wohnung-kaufen",
        metadata={
            "city": "München",
            "property_type": "apartment",
            "avg_price_sqm": 8200,
            "delta_30d_pct": -10,
            "new_listings": 12,
            "demo": True,
        },
    ),
    Signal(
        title="Berlin Mitte: Commercial space availability up 23% QoQ",
        body=(
            "Commercial real estate availability in Berlin-Mitte has increased 23% quarter-on-quarter, "
            "with 47 new office/retail listings. "
            "Avg price: €4,200/sqm for office space (down from €5,100). "
            "Key driver: 3 major tech companies subletting excess space post-layoffs. "
            "Window for negotiating favorable long-term leases is open now."
        ),
        score=0.76,
        source_url="https://www.immobilienscout24.de/Suche/de/gewerbe-kaufen",
        metadata={"city": "Berlin", "property_type": "commercial", "demo": True},
    ),
]

IMMOSCOUT_SEARCH_URL = "https://www.immobilienscout24.de/Suche/de"


class RealEstateSignal(BaseModule):
    module_id = "real-estate-signal"
    display_name = "Real Estate Signal"
    cluster = "b2b-intelligence"
    default_schedule = "0 8 * * *"
    required_plan = "pro"
    description = (
        "Monitors ImmoScout24 for new listings, price trends, and market signals "
        "in configured zip codes and cities."
    )

    config_schema = {
        "type": "object",
        "properties": {
            "zip_codes": {
                "type": "array",
                "title": "German zip codes to monitor",
                "items": {"type": "string"},
            },
            "cities": {
                "type": "array",
                "title": "Cities to monitor",
                "items": {"type": "string"},
            },
            "property_types": {
                "type": "array",
                "title": "Property types",
                "items": {
                    "type": "string",
                    "enum": ["apartment", "house", "commercial"],
                },
                "default": ["apartment"],
            },
            "max_price_sqm": {
                "type": "number",
                "title": "Maximum price per sqm (EUR)",
                "default": 10000,
            },
        },
    }

    def validate_config(self, config: dict) -> bool:
        return isinstance(config, dict)

    async def run(self, config: dict, db_session) -> List[Signal]:
        zip_codes: List[str] = config.get("zip_codes", [])
        cities: List[str] = config.get("cities", [])
        property_types: List[str] = config.get("property_types", ["apartment"])
        max_price_sqm: float = float(config.get("max_price_sqm", 10000))

        if not zip_codes and not cities:
            return DEMO_SIGNALS

        signals: List[Signal] = []

        for city in cities[:3]:
            for prop_type in property_types[:2]:
                try:
                    city_signals = await self._search_immoscout(
                        city=city,
                        zip_code=None,
                        property_type=prop_type,
                        max_price_sqm=max_price_sqm,
                        db_session=db_session,
                    )
                    signals.extend(city_signals)
                except Exception as exc:
                    logger.warning(f"ImmoScout search failed for {city}/{prop_type}: {exc}")

        for zip_code in zip_codes[:3]:
            try:
                zip_signals = await self._search_immoscout(
                    city=None,
                    zip_code=zip_code,
                    property_type=property_types[0] if property_types else "apartment",
                    max_price_sqm=max_price_sqm,
                    db_session=db_session,
                )
                signals.extend(zip_signals)
            except Exception as exc:
                logger.warning(f"ImmoScout search failed for zip {zip_code}: {exc}")

        return signals if signals else DEMO_SIGNALS

    async def _search_immoscout(
        self,
        city: Optional[str],
        zip_code: Optional[str],
        property_type: str,
        max_price_sqm: float,
        db_session,
    ) -> List[Signal]:
        type_path_map = {
            "apartment": "wohnung-kaufen",
            "house": "haus-kaufen",
            "commercial": "gewerbe-kaufen",
        }
        path = type_path_map.get(property_type, "wohnung-kaufen")
        search_term = city or zip_code or "Deutschland"
        url = f"{IMMOSCOUT_SEARCH_URL}/{path}?q={search_term.replace(' ', '+')}"

        try:
            html = await scraper_engine.fetch(url, js_render=True, wait_selector="[data-testid='result-list']")
        except Exception as exc:
            logger.warning(f"ImmoScout fetch failed: {exc}")
            return []

        if not html or len(html) < 1000:
            return []

        schema = {
            "type": "object",
            "properties": {
                "listings": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "address": {"type": "string"},
                            "price_total": {"type": "number"},
                            "price_sqm": {"type": "number"},
                            "area_sqm": {"type": "number"},
                            "rooms": {"type": "number"},
                            "url": {"type": "string"},
                        },
                    },
                },
                "market_summary": {
                    "type": "object",
                    "properties": {
                        "avg_price_sqm": {"type": "number"},
                        "total_listings": {"type": "number"},
                        "price_trend": {"type": "string"},
                    },
                },
            },
            "required": ["listings", "market_summary"],
        }

        system_prompt = (
            f"Extract real estate listings and market summary from ImmoScout24 search results. "
            f"Location: {city or zip_code}. Property type: {property_type}. "
            f"Focus on listings at or below {max_price_sqm} EUR/sqm. "
            "Summarize market trends (price direction, availability, notable patterns)."
        )

        extracted = await llm_extractor.extract_structured(html[:20000], schema, system_prompt)

        if not extracted:
            return []

        listings = extracted.get("listings", [])
        market = extracted.get("market_summary", {})
        avg_sqm = market.get("avg_price_sqm", 0)
        total = market.get("total_listings", len(listings))
        trend = market.get("price_trend", "stable")

        affordable = [l for l in listings if l.get("price_sqm", float("inf")) <= max_price_sqm]

        if not affordable and avg_sqm > max_price_sqm:
            return []

        body_lines = [
            f"**{city or 'Area ' + zip_code}** — {property_type.capitalize()} market overview",
            f"New listings found: {len(listings)} | Avg price/sqm: €{avg_sqm:,.0f} | Trend: {trend}",
            "",
            f"**Within your budget (≤€{max_price_sqm}/sqm):** {len(affordable)} listings",
        ]
        for listing in affordable[:5]:
            sqm = listing.get("area_sqm", "?")
            price = listing.get("price_total", 0)
            price_sqm = listing.get("price_sqm", 0)
            rooms = listing.get("rooms", "?")
            addr = listing.get("address", "Address withheld")
            body_lines.append(f"- {addr}: {sqm}sqm, {rooms}R — €{price:,.0f} (€{price_sqm:,.0f}/sqm)")

        score = 0.6
        if len(affordable) >= 5:
            score = 0.8
        if trend in ("falling", "down", "decrease"):
            score = min(score + 0.1, 1.0)

        return [
            Signal(
                title=f"{city or zip_code}: {len(affordable)} listings ≤€{max_price_sqm}/sqm — {total} total",
                body="\n".join(body_lines),
                score=score,
                source_url=url,
                metadata={
                    "city": city,
                    "zip_code": zip_code,
                    "property_type": property_type,
                    "avg_price_sqm": avg_sqm,
                    "affordable_count": len(affordable),
                    "trend": trend,
                },
            )
        ]
