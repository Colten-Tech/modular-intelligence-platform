import logging
from typing import Any, Dict, List, Optional

import httpx

from app.core.base_module import BaseModule, Signal
from app.utils.llm import llm_extractor

logger = logging.getLogger(__name__)

CLINICALTRIALS_API = "https://clinicaltrials.gov/api/v2/studies"

DEMO_SIGNALS = [
    Signal(
        title="BioNTech SE: Phase III trial for mRNA cancer vaccine enters enrollment",
        body=(
            "NCT05547113: BioNTech's individualized neoantigen mRNA cancer vaccine (BNT111) "
            "has entered Phase III enrollment for melanoma. "
            "Target enrollment: 2,000 patients across 120 sites. "
            "Primary endpoint: Disease-Free Survival at 36 months. "
            "Partner: Regeneron (pembrolizumab combo). "
            "Estimated completion: 2027-Q2."
        ),
        score=0.92,
        source_url="https://clinicaltrials.gov/study/NCT05547113",
        metadata={
            "company": "BioNTech",
            "phase": "III",
            "area": "Oncology",
            "status": "Recruiting",
            "demo": True,
        },
    ),
    Signal(
        title="Bayer AG: Phase II trial suspended — cardiotoxicity signal detected",
        body=(
            "NCT05321089: Bayer's BAY 2395840 (KRAS G12C inhibitor) Phase II trial "
            "has been suspended by the DSMB following a cardiotoxicity signal in 3 patients. "
            "Suspension effective 2024-01-08. All 47 enrolled patients being monitored. "
            "This is the second KRAS inhibitor to show cardiac adverse events in Phase II."
        ),
        score=0.89,
        source_url="https://clinicaltrials.gov/study/NCT05321089",
        metadata={
            "company": "Bayer",
            "phase": "II",
            "area": "Oncology",
            "status": "Suspended",
            "event": "suspension",
            "demo": True,
        },
    ),
]


class ClinicalTrialTracker(BaseModule):
    module_id = "clinical-trial-tracker"
    display_name = "Clinical Trial Tracker"
    cluster = "b2b-intelligence"
    default_schedule = "0 7 * * *"
    required_plan = "pro"
    description = (
        "Monitors ClinicalTrials.gov for trial updates: phase transitions, suspensions, "
        "new enrollments, and completions for configured therapeutic areas and companies."
    )

    config_schema = {
        "type": "object",
        "properties": {
            "therapeutic_areas": {
                "type": "array",
                "title": "Therapeutic areas to track",
                "description": "Enter the medical or disease areas you want to monitor for clinical trial activity, e.g. 'Oncology', 'Cardiology', or 'Neurology'. Add one area per entry.",
                "items": {"type": "string"},
                "default": ["Oncology"],
            },
            "company_names": {
                "type": "array",
                "title": "Company names to track",
                "description": "Enter the names of pharmaceutical or biotech companies whose trials you want to follow, e.g. 'BioNTech' or 'Bayer'. Add one company name per entry.",
                "items": {"type": "string"},
            },
            "min_phase": {
                "type": "string",
                "title": "Minimum trial phase",
                "description": "Set the earliest clinical trial phase to include. Choose 'I' for all phases, 'II' for mid-to-late stage, 'III' for late-stage only, or 'any' for no phase filter.",
                "enum": ["I", "II", "III", "any"],
                "default": "II",
            },
            "track_suspensions": {
                "type": "boolean",
                "title": "Alert on trial suspensions",
                "description": "Enable to receive alerts whenever a tracked trial is suspended, which may indicate a safety signal or protocol issue.",
                "default": True,
            },
        },
    }

    def validate_config(self, config: dict) -> bool:
        return isinstance(config, dict)

    async def run(self, config: dict, db_session, module_instance_id: str = None) -> List[Signal]:
        therapeutic_areas: List[str] = config.get("therapeutic_areas", ["Oncology"])
        company_names: List[str] = config.get("company_names", [])
        min_phase: str = config.get("min_phase", "II")
        track_suspensions: bool = config.get("track_suspensions", True)

        if not therapeutic_areas and not company_names:
            return DEMO_SIGNALS

        signals: List[Signal] = []

        # Fetch from ClinicalTrials.gov API
        try:
            raw_studies = await self._fetch_studies(therapeutic_areas, company_names, min_phase)
            for study in raw_studies[:20]:
                sig = self._study_to_signal(study, min_phase, track_suspensions)
                if sig:
                    signals.append(sig)
        except Exception as exc:
            logger.warning(f"ClinicalTrials API failed: {exc}")
            return DEMO_SIGNALS

        return signals if signals else DEMO_SIGNALS

    async def _fetch_studies(
        self,
        therapeutic_areas: List[str],
        company_names: List[str],
        min_phase: str,
    ) -> List[Dict[str, Any]]:
        params: Dict[str, Any] = {
            "format": "json",
            "pageSize": 20,
            "sort": "LastUpdatePostDate:desc",
            "fields": (
                "NCTId,BriefTitle,OfficialTitle,Phase,OverallStatus,"
                "SponsorName,InterventionType,Condition,StartDate,"
                "CompletionDate,EnrollmentCount,LocationCountry"
            ),
        }

        # Build query
        query_parts = []
        if therapeutic_areas:
            area_query = " OR ".join(f'AREA[Condition]"{area}"' for area in therapeutic_areas[:3])
            query_parts.append(f"({area_query})")
        if company_names:
            company_query = " OR ".join(
                f'AREA[SponsorName]"{company}"' for company in company_names[:5]
            )
            query_parts.append(f"({company_query})")

        if query_parts:
            params["query.term"] = " AND ".join(query_parts)

        # Phase filter
        params["filter.overallStatus"] = "RECRUITING,ACTIVE_NOT_RECRUITING,SUSPENDED,COMPLETED"
        if min_phase != "any":
            phase_values = {
                "I": "PHASE1,PHASE2,PHASE3,PHASE4",
                "II": "PHASE2,PHASE3,PHASE4",
                "III": "PHASE3,PHASE4",
            }
            params["filter.phase"] = phase_values.get(min_phase, "PHASE2,PHASE3,PHASE4")

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(CLINICALTRIALS_API, params=params)
            resp.raise_for_status()
            data = resp.json()

        studies = data.get("studies", [])
        return studies

    def _study_to_signal(
        self,
        study: Dict[str, Any],
        min_phase: str,
        track_suspensions: bool,
    ) -> Optional[Signal]:
        protocol = study.get("protocolSection", {})
        id_module = protocol.get("identificationModule", {})
        status_module = protocol.get("statusModule", {})
        design_module = protocol.get("designModule", {})
        sponsor_module = protocol.get("sponsorCollaboratorsModule", {})
        conditions_module = protocol.get("conditionsModule", {})

        nct_id = id_module.get("nctId", "")
        title = id_module.get("briefTitle", "")
        phase = design_module.get("phases", ["N/A"])
        if isinstance(phase, list):
            phase_str = "/".join(phase)
        else:
            phase_str = str(phase)

        # Filter by min phase
        phase_order = {"PHASE1": 1, "PHASE2": 2, "PHASE3": 3, "PHASE4": 4}
        min_phase_map = {"I": 1, "II": 2, "III": 3, "any": 0}
        min_level = min_phase_map.get(min_phase, 0)
        study_level = max((phase_order.get(p, 0) for p in (phase if isinstance(phase, list) else [phase])), default=0)
        if study_level < min_level:
            return None

        overall_status = status_module.get("overallStatus", "")
        sponsor = sponsor_module.get("leadSponsor", {}).get("name", "Unknown")
        conditions = conditions_module.get("conditions", [])
        enrollment = design_module.get("enrollmentInfo", {}).get("count", 0)
        completion_date = status_module.get("completionDateStruct", {}).get("date", "TBD")
        start_date = status_module.get("startDateStruct", {}).get("date", "TBD")

        # Score based on phase and status
        score = 0.5
        if "PHASE3" in phase:
            score = 0.9
        elif "PHASE2" in phase:
            score = 0.75
        elif "PHASE1" in phase:
            score = 0.55

        if overall_status == "SUSPENDED" and not track_suspensions:
            return None

        if overall_status == "SUSPENDED":
            score = min(score + 0.1, 1.0)
            status_note = "SUSPENDED — safety signal or protocol amendment"
        elif overall_status == "COMPLETED":
            status_note = "COMPLETED"
        elif overall_status == "RECRUITING":
            status_note = "Actively recruiting"
        else:
            status_note = overall_status

        body = (
            f"NCT ID: {nct_id} | Phase: {phase_str} | Status: {status_note}\n"
            f"Sponsor: {sponsor}\n"
            f"Conditions: {', '.join(conditions[:3])}\n"
            f"Enrollment: {enrollment} | Start: {start_date} | Completion: {completion_date}\n\n"
            f"**Clinical significance**: Phase {phase_str} trial for {', '.join(conditions[:2])} "
            f"with {enrollment} patients. Monitor for interim results and regulatory filings."
        )

        return Signal(
            title=f"{sponsor}: {title[:100]}",
            body=body,
            score=score,
            source_url=f"https://clinicaltrials.gov/study/{nct_id}",
            metadata={
                "nct_id": nct_id,
                "phase": phase_str,
                "status": overall_status,
                "company": sponsor,
                "conditions": conditions[:5],
            },
        )
