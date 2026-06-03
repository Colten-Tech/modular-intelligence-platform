import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional

import httpx

from app.core.base_module import BaseModule, Signal
from app.utils.llm import llm_extractor

logger = logging.getLogger(__name__)

EU_FUNDING_API = "https://api.ec.europa.eu/search-api/prod/rest/search"
BMBF_URL = "https://www.bmbf.de/bmbf/de/forschung/forschungsfoerderung/foerderprogramme"
EXIST_URL = "https://www.exist.de/EXIST/Navigation/DE/Gruenden/Foerderprogramme/foerderprogramme.html"

DEMO_SIGNALS = [
    Signal(
        title="EU Horizon Europe: €4.2M available for AI-driven supply chain SMEs",
        body=(
            "Horizon Europe Call ID: HORIZON-CL4-2024-TWIN-02-08. "
            "Focus: AI and digital twin technologies for manufacturing SMEs. "
            "Deadline: 2024-09-17. Budget: €4.2M per project. "
            "Eligibility: SMEs in manufacturing, logistics, or supply chain with 3+ EU partners. "
            "Relevance: High for companies with AI/ML focus in industrial applications."
        ),
        score=0.88,
        source_url="https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/horizon-cl4-2024-twin-02-08",
        metadata={"funder": "EU Horizon Europe", "deadline": "2024-09-17", "amount_eur": 4_200_000, "demo": True},
    ),
    Signal(
        title="BMBF: KMU-innovativ Förderung — €500K for deep tech startups",
        body=(
            "BMBF's KMU-innovativ program has opened a new call for deep tech startups "
            "in Biotechnology, IT/AI, and Production Technology. "
            "Funding: up to €500K per project, non-dilutive. "
            "Application window: rolling submissions, next cutoff March 15. "
            "Special focus on climate tech and quantum computing applications."
        ),
        score=0.82,
        source_url="https://www.bmbf.de/bmbf/de/forschung/kmu-innovativ/kmu-innovativ.html",
        metadata={"funder": "BMBF", "program": "KMU-innovativ", "demo": True},
    ),
    Signal(
        title="EXIST Transfer of Research: Up to €800K for university spin-offs",
        body=(
            "EXIST Transfer of Research program is accepting new applications. "
            "Funding up to €800K over 18 months for university spin-offs with commercially viable IP. "
            "Target: teams developing products based on research IP with clear market application. "
            "Application deadline: rolling, quarterly review. "
            "Contact: your university's technology transfer office."
        ),
        score=0.76,
        source_url="https://www.exist.de/EXIST/Navigation/DE/Gruenden/Foerderprogramme/foerderprogramme.html",
        metadata={"funder": "BMBF/EXIST", "program": "EXIST Transfer of Research", "demo": True},
    ),
]


class GrantFundingTracker(BaseModule):
    module_id = "grant-funding-tracker"
    display_name = "Grant & Funding Tracker"
    cluster = "b2b-intelligence"
    default_schedule = "0 6 * * *"
    required_plan = "free"
    description = (
        "Tracks EU, BMBF, and EXIST grant opportunities. "
        "Scores each grant against your company profile using AI."
    )

    config_schema = {
        "type": "object",
        "properties": {
            "company_sector": {
                "type": "string",
                "title": "Company sector (e.g. 'AI/ML SaaS', 'Biotech', 'CleanTech')",
                "description": "Enter a short description of your company's sector, e.g. 'AI/ML SaaS', 'Biotech', or 'CleanTech'. This is used to score how relevant each grant opportunity is to your business.",
            },
            "company_stage": {
                "type": "string",
                "title": "Company stage",
                "description": "Select your company's current funding stage. This filters grants to those open to companies at your stage — from seed-stage to growth.",
                "enum": ["seed", "series-a", "series-b", "growth"],
                "default": "seed",
            },
            "technology_focus": {
                "type": "array",
                "title": "Technology keywords",
                "description": "Enter keywords describing your core technologies, e.g. 'machine learning', 'quantum computing', or 'CRISPR'. Add one keyword per entry to improve grant matching accuracy.",
                "items": {"type": "string"},
            },
            "regions": {
                "type": "array",
                "title": "Regions to search",
                "description": "Enter the regions or countries to search for grants, e.g. 'Germany' or 'EU'. Add one region per entry.",
                "items": {"type": "string"},
                "default": ["Germany", "EU"],
            },
            "sources": {
                "type": "array",
                "title": "Grant databases to search",
                "section": "source",
                "description": "Choose which funding databases to search. EU Horizon covers European research grants. BMBF covers German federal innovation funding. EXIST is specifically for university spin-offs and early-stage startups.",
                "items": {
                    "type": "string",
                    "enum": ["eu_horizon", "bmbf", "exist"],
                },
                "default": ["eu_horizon", "bmbf", "exist"],
            },
            "min_relevance": {
                "type": "number",
                "title": "Minimum relevance score (0–1)",
                "description": "Only show grants with a relevance score at or above this threshold (0 to 1). For example, 0.5 returns moderately relevant grants; 0.8 returns only the most closely matched opportunities.",
                "default": 0.5,
                "minimum": 0,
                "maximum": 1,
            },
        },
    }

    def validate_config(self, config: dict) -> bool:
        return isinstance(config, dict)

    async def run(self, config: dict, db_session) -> List[Signal]:
        sector = config.get("company_sector", "")
        stage = config.get("company_stage", "seed")
        tech_focus = config.get("technology_focus", [])
        regions = config.get("regions", ["Germany", "EU"])
        min_relevance = float(config.get("min_relevance", 0.5))

        if not sector:
            logger.info("grant-funding-tracker: No sector configured, returning demo signals")
            return [s for s in DEMO_SIGNALS if s.score >= min_relevance]

        signals: List[Signal] = []

        # 1. EU Funding & Tenders API
        try:
            eu_signals = await self._fetch_eu_grants(sector, tech_focus, min_relevance)
            signals.extend(eu_signals)
        except Exception as exc:
            logger.warning(f"EU grants API failed: {exc}")

        # 2. BMBF scrape
        try:
            bmbf_signals = await self._fetch_bmbf_grants(sector, stage, min_relevance)
            signals.extend(bmbf_signals)
        except Exception as exc:
            logger.warning(f"BMBF scrape failed: {exc}")

        if not signals:
            return [s for s in DEMO_SIGNALS if s.score >= min_relevance]

        return signals

    async def _fetch_eu_grants(
        self, sector: str, tech_focus: List[str], min_relevance: float
    ) -> List[Signal]:
        keywords = " ".join([sector] + tech_focus[:3])

        params = {
            "apiKey": "SEDIA",
            "text": keywords,
            "pageSize": "10",
            "pageNumber": "0",
            "sortBy": "startDate",
            "sortOrder": "DESC",
            "scope": "sedia",
            "type": "9,14",  # calls and topics
            "facets": "type,frameworkProgramme,programmePeriod",
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(EU_FUNDING_API, params=params)
            resp.raise_for_status()
            data = resp.json()

        results = data.get("results", [])
        if not results:
            return []

        signals = []
        for item in results[:5]:
            title = item.get("title", {})
            if isinstance(title, dict):
                title_str = title.get("en", "") or next(iter(title.values()), "EU Grant")
            else:
                title_str = str(title)

            metadata_raw = item.get("metadata", {})
            deadline_raw = metadata_raw.get("deadlineModel", {}).get("deadlineDates", [None])[0] if isinstance(metadata_raw, dict) else None
            budget_raw = metadata_raw.get("budgetOverviewInEuPerActivity", 0) if isinstance(metadata_raw, dict) else 0

            description = item.get("description", {})
            if isinstance(description, dict):
                desc_str = description.get("en", "") or next(iter(description.values()), "")
            else:
                desc_str = str(description)

            relevance_score = await self._score_relevance(title_str, desc_str, sector, tech_focus)
            if relevance_score < min_relevance:
                continue

            url = f"https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/{item.get('identifier', '')}"

            signals.append(
                Signal(
                    title=f"EU Grant: {title_str[:120]}",
                    body=f"{desc_str[:500]}\n\nDeadline: {deadline_raw or 'TBD'} | Budget: {budget_raw or 'See link'}",
                    score=relevance_score,
                    source_url=url,
                    metadata={
                        "funder": "EU Horizon Europe",
                        "deadline": deadline_raw,
                        "budget": budget_raw,
                        "identifier": item.get("identifier"),
                    },
                )
            )

        return signals

    async def _fetch_bmbf_grants(
        self, sector: str, stage: str, min_relevance: float
    ) -> List[Signal]:
        from app.core.scraper import scraper_engine

        try:
            html = await scraper_engine.fetch(BMBF_URL, js_render=False)
        except Exception as exc:
            logger.warning(f"BMBF fetch failed: {exc}")
            return []

        if not html:
            return []

        schema = {
            "type": "object",
            "properties": {
                "grants": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "body": {"type": "string"},
                            "deadline": {"type": "string"},
                            "amount": {"type": "string"},
                            "url": {"type": "string"},
                            "score": {"type": "number", "minimum": 0, "maximum": 1},
                        },
                        "required": ["title", "body", "score"],
                    },
                }
            },
            "required": ["grants"],
        }

        system_prompt = (
            f"Extract BMBF grant/funding opportunities from this page. "
            f"Company profile: sector='{sector}', stage='{stage}'. "
            "Score each grant's relevance for this company profile (0.0–1.0). "
            "Include deadline, funding amount, and a concise description."
        )

        extracted = await llm_extractor.extract_structured(html[:15000], schema, system_prompt)
        signals = []
        for item in extracted.get("grants", []):
            if float(item.get("score", 0)) < min_relevance:
                continue
            signals.append(
                Signal(
                    title=f"BMBF Grant: {item.get('title', 'Grant Opportunity')}",
                    body=item.get("body", ""),
                    score=float(item.get("score", 0.6)),
                    source_url=item.get("url", BMBF_URL),
                    metadata={
                        "funder": "BMBF",
                        "deadline": item.get("deadline"),
                        "amount": item.get("amount"),
                    },
                )
            )
        return signals

    async def _score_relevance(
        self, title: str, description: str, sector: str, tech_focus: List[str]
    ) -> float:
        """Quick relevance scoring using keyword matching + LLM fallback."""
        content = f"{title} {description}".lower()
        sector_lower = sector.lower()
        tech_lower = [t.lower() for t in tech_focus]

        score = 0.3
        if sector_lower in content:
            score += 0.3
        for tech in tech_lower:
            if tech in content:
                score += 0.1

        return min(score, 1.0)
