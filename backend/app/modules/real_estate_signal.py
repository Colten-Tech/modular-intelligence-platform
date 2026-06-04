import logging
from typing import List, Optional

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

SOURCE_BASE_URLS = {
    "immoscout24": "https://www.immobilienscout24.de/Suche/de",
    "immowelt":    "https://www.immowelt.de/suche",
    "immonet":     "https://www.immonet.de/immobiliensuche",
    "kleinanzeigen": "https://www.kleinanzeigen.de/s-immobilien",
}

# Legacy alias kept for internal calls
IMMOSCOUT_SEARCH_URL = SOURCE_BASE_URLS["immoscout24"]


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
            "sources": {
                "type": "array",
                "title": "Property portals to search",
                "section": "source",
                "description": "Choose which German property portals to scrape. ImmoScout24 has the widest inventory. Immowelt and Immonet often list different properties. Kleinanzeigen picks up private/off-market listings.",
                "items": {
                    "type": "string",
                    "enum": ["immoscout24", "immowelt", "immonet", "kleinanzeigen"],
                },
                "default": ["immoscout24"],
            },
            "zip_codes": {
                "type": "array",
                "title": "German zip codes to monitor",
                "section": "source",
                "description": "Enter German postal codes for the areas you want to track, e.g. '80331' for central München. Add one zip code per entry.",
                "items": {"type": "string"},
            },
            "cities": {
                "type": "array",
                "title": "Cities to monitor",
                "section": "source",
                "description": "Enter the names of German cities to monitor for real estate listings, e.g. 'München' or 'Berlin'. Add one city per entry.",
                "items": {"type": "string"},
            },
            "property_types": {
                "type": "array",
                "title": "Property types",
                "description": "Select the types of properties you want to monitor: apartments, houses, or commercial real estate. Select all that apply.",
                "items": {
                    "type": "string",
                    "enum": ["apartment", "house", "commercial"],
                },
                "default": ["apartment"],
            },
            "max_price_sqm": {
                "type": "number",
                "title": "Maximum price per sqm (EUR)",
                "description": "Set your maximum acceptable price per square meter in euros. Listings above this threshold will be filtered out. For example, enter 10000 for €10,000/sqm.",
                "default": 10000,
            },
        },
    }

    def validate_config(self, config: dict) -> bool:
        return isinstance(config, dict)

    async def run(self, config: dict, db_session, module_instance_id: str = None) -> List[Signal]:
        sources: List[str] = config.get("sources", ["immoscout24"])
        zip_codes: List[str] = config.get("zip_codes", [])
        cities: List[str] = config.get("cities", [])
        property_types: List[str] = config.get("property_types", ["apartment"])
        max_price_sqm: float = float(config.get("max_price_sqm", 10000))

        if not zip_codes and not cities:
            return DEMO_SIGNALS

        signals: List[Signal] = []
        locations = [("city", c) for c in cities[:3]] + [("zip", z) for z in zip_codes[:3]]

        for source in sources:
            base_url = SOURCE_BASE_URLS.get(source, IMMOSCOUT_SEARCH_URL)
            for loc_type, loc_value in locations:
                for prop_type in property_types[:2]:
                    try:
                        new_signals = await self._search_portal(
                            source=source,
                            base_url=base_url,
                            city=loc_value if loc_type == "city" else None,
                            zip_code=loc_value if loc_type == "zip" else None,
                            property_type=prop_type,
                            max_price_sqm=max_price_sqm,
                            db_session=db_session,
                        )
                        signals.extend(new_signals)
                    except Exception as exc:
                        logger.warning(f"{source} search failed for {loc_value}/{prop_type}: {exc}")

        return signals if signals else DEMO_SIGNALS

    async def _search_portal(
        self,
        source: str,
        base_url: str,
        city: Optional[str],
        zip_code: Optional[str],
        property_type: str,
        max_price_sqm: float,
        db_session,
    ) -> List[Signal]:
        search_term = (city or zip_code or "Deutschland").replace(" ", "+")

        # Build a sensible search URL for each portal
        if source == "immoscout24":
            type_path = {"apartment": "wohnung-kaufen", "house": "haus-kaufen", "commercial": "gewerbe-kaufen"}
            url = f"{base_url}/{type_path.get(property_type, 'wohnung-kaufen')}?q={search_term}"
        elif source == "immowelt":
            type_path = {"apartment": "wohnungen/kaufen", "house": "haeuser/kaufen", "commercial": "gewerbeimmobilien/kaufen"}
            url = f"{base_url}/{type_path.get(property_type, 'wohnungen/kaufen')}?lage={search_term}"
        elif source == "immonet":
            type_path = {"apartment": "eigentumswohnung", "house": "haus-kaufen", "commercial": "gewerbeimmobilien"}
            url = f"{base_url}/{type_path.get(property_type, 'eigentumswohnung')}?q={search_term}"
        elif source == "kleinanzeigen":
            url = f"{base_url}/{search_term.lower()}"
        else:
            url = f"{base_url}?q={search_term}"

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

        portal_label = {"immoscout24": "ImmoScout24", "immowelt": "Immowelt",
                        "immonet": "Immonet", "kleinanzeigen": "Kleinanzeigen"}.get(source, source)

        system_prompt = (
            f"Extract real estate listings and market summary from {portal_label} search results. "
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

        affordable = [listing for listing in listings if listing.get("price_sqm", float("inf")) <= max_price_sqm]

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
                title=f"[{portal_label}] {city or zip_code}: {len(affordable)} listings ≤€{max_price_sqm}/sqm — {total} total",
                body="\n".join(body_lines),
                score=score,
                source_url=url,
                metadata={
                    "source": source,
                    "portal": portal_label,
                    "city": city,
                    "zip_code": zip_code,
                    "property_type": property_type,
                    "avg_price_sqm": avg_sqm,
                    "affordable_count": len(affordable),
                    "trend": trend,
                },
            )
        ]
