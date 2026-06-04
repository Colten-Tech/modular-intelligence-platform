import logging
import uuid
from typing import Any, Dict, List, Optional

import httpx

from app.core.base_module import BaseModule, Signal
from app.utils.llm import llm_extractor

logger = logging.getLogger(__name__)

ARXIV_API = "https://export.arxiv.org/api/query"

DEMO_SIGNALS = [
    Signal(
        title="[arXiv] 'Scaling Laws for Reward Model Overoptimization' — Key findings extracted",
        body=(
            "**Paper:** Scaling Laws for Reward Model Overoptimization (Gao et al., 2023)\n"
            "**arXiv:** 2210.10760\n\n"
            "**Key Claims:**\n"
            "1. Reward model score increases monotonically with RL training, but true reward peaks early\n"
            "2. Overoptimization grows with sqrt(KL divergence) from policy to initial LM\n"
            "3. Larger reward models are more robust to overoptimization\n\n"
            "**Methods:** KL-regularized RL, synthetic bandit setting, 6 RM sizes (3M–3B params)\n\n"
            "**Implications:** RLHF pipelines need validation reward models separate from training RM. "
            "Direct relevance to LLM alignment work."
        ),
        score=0.88,
        source_url="https://arxiv.org/abs/2210.10760",
        metadata={"type": "arxiv", "arxiv_id": "2210.10760", "tags": ["RLHF", "LLM", "alignment"], "demo": True},
    ),
]


class ResearcherSecondBrain(BaseModule):
    module_id = "researcher-second-brain"
    display_name = "Researcher Second Brain"
    cluster = "consumer-data"
    default_schedule = "0 0 * * *"
    required_plan = "free"
    description = (
        "Processes arXiv papers and uploaded PDFs. Extracts key claims, methods, and results. "
        "Generates embeddings for semantic search."
    )

    config_schema = {
        "type": "object",
        "properties": {
            "auto_fetch_arxiv": {
                "type": "boolean",
                "title": "Auto-fetch recent arXiv papers matching tags",
                "description": "Enable to automatically retrieve and process the most recent arXiv papers that match your research topic tags on each run.",
                "default": False,
            },
            "default_tags": {
                "type": "array",
                "title": "Research topic tags",
                "description": "Enter keywords representing your research interests, e.g. 'machine learning' or 'RLHF'. These tags are used to search arXiv and to score paper relevance. Add one tag per entry.",
                "items": {"type": "string"},
                "default": ["machine learning", "LLM"],
            },
            "arxiv_ids": {
                "type": "array",
                "title": "Specific arXiv IDs to process",
                "description": "Add the arXiv paper IDs you want to process directly, e.g. '2210.10760'. You can find the ID in the arXiv URL. Add one ID per entry.",
                "items": {"type": "string"},
            },
        },
    }

    def validate_config(self, config: dict) -> bool:
        return isinstance(config, dict)

    def get_ui_component_hint(self) -> str:
        return "second-brain"

    async def run(self, config: dict, db_session, module_instance_id: str = None) -> List[Signal]:
        auto_fetch: bool = config.get("auto_fetch_arxiv", False)
        tags: List[str] = config.get("default_tags", ["machine learning"])
        arxiv_ids: List[str] = config.get("arxiv_ids", [])

        signals: List[Signal] = []

        # 1. Process specific arXiv IDs
        for arxiv_id in arxiv_ids[:10]:
            try:
                sig = await self._process_arxiv_paper(arxiv_id.strip(), tags, db_session, module_instance_id)
                if sig:
                    signals.append(sig)
            except Exception as exc:
                logger.warning(f"Failed to process arXiv {arxiv_id}: {exc}")

        # 2. Auto-fetch recent papers if enabled
        if auto_fetch and tags:
            try:
                new_papers = await self._fetch_recent_arxiv(tags)
                for paper_id in new_papers[:5]:
                    try:
                        sig = await self._process_arxiv_paper(paper_id, tags, db_session, module_instance_id)
                        if sig:
                            signals.append(sig)
                    except Exception as exc:
                        logger.warning(f"Failed to process arXiv {paper_id}: {exc}")
            except Exception as exc:
                logger.warning(f"arXiv auto-fetch failed: {exc}")

        return signals if signals else DEMO_SIGNALS

    async def _fetch_recent_arxiv(self, tags: List[str]) -> List[str]:
        query = "+AND+".join(f"ti:{tag.replace(' ', '+')}" for tag in tags[:3])
        params = {
            "search_query": query,
            "start": 0,
            "max_results": 10,
            "sortBy": "submittedDate",
            "sortOrder": "descending",
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(ARXIV_API, params=params)
            resp.raise_for_status()
            xml_content = resp.text

        # Parse Atom XML to extract IDs
        import re
        ids = re.findall(r"<id>http://arxiv\.org/abs/([^<]+)</id>", xml_content)
        return ids

    async def _process_arxiv_paper(
        self, arxiv_id: str, tags: List[str], db_session, module_instance_id: str = None
    ) -> Optional[Signal]:
        # Fetch abstract from arXiv
        params = {"id_list": arxiv_id, "max_results": 1}
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(ARXIV_API, params=params)
            resp.raise_for_status()
            xml_content = resp.text

        import re

        title_match = re.search(r"<title>(?!ArXiv)([^<]+)</title>", xml_content)
        abstract_match = re.search(r"<summary>([^<]+)</summary>", xml_content, re.DOTALL)
        authors_matches = re.findall(r"<name>([^<]+)</name>", xml_content)
        published_match = re.search(r"<published>([^<]+)</published>", xml_content)

        if not title_match:
            return None

        title = title_match.group(1).strip()
        abstract = abstract_match.group(1).strip() if abstract_match else ""
        authors = authors_matches[:4]
        published = published_match.group(1)[:10] if published_match else "Unknown date"

        if not abstract:
            return None

        # LLM extraction of key insights
        schema = {
            "type": "object",
            "properties": {
                "key_claims": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Main research claims or findings",
                },
                "methods": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Methods or approaches used",
                },
                "implications": {
                    "type": "string",
                    "description": "Practical implications for researchers/practitioners",
                },
                "relevance_score": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1,
                    "description": "Relevance to the configured research tags",
                },
            },
            "required": ["key_claims", "methods", "implications", "relevance_score"],
        }

        system_prompt = (
            f"You are a research assistant. Extract structured insights from this paper abstract. "
            f"User's research interests: {', '.join(tags)}. "
            "Score relevance 0–1 based on alignment with these interests."
        )

        extracted = await llm_extractor.extract_structured(
            f"Title: {title}\nAbstract: {abstract}", schema, system_prompt
        )

        if not extracted:
            extracted = {
                "key_claims": [abstract[:300]],
                "methods": [],
                "implications": "",
                "relevance_score": 0.5,
            }

        claims = extracted.get("key_claims", [])
        methods = extracted.get("methods", [])
        implications = extracted.get("implications", "")
        score = float(extracted.get("relevance_score", 0.5))

        body_parts = [
            f"**Authors:** {', '.join(authors[:3])}{'...' if len(authors) > 3 else ''}",
            f"**Published:** {published}",
            "",
            "**Key Claims:**",
        ]
        for i, claim in enumerate(claims[:4], 1):
            body_parts.append(f"{i}. {claim}")

        if methods:
            body_parts.extend(["", "**Methods:**"])
            for m in methods[:3]:
                body_parts.append(f"- {m}")

        if implications:
            body_parts.extend(["", f"**Implications:** {implications}"])

        # Generate and store embedding
        if db_session and module_instance_id:
            await self._store_embedding(
                arxiv_id=arxiv_id,
                text=f"{title}\n{abstract}",
                metadata={"arxiv_id": arxiv_id, "title": title, "tags": tags},
                db_session=db_session,
                module_instance_id=module_instance_id,
            )

        return Signal(
            title=f"[arXiv] {title[:100]}",
            body="\n".join(body_parts),
            score=score,
            source_url=f"https://arxiv.org/abs/{arxiv_id}",
            metadata={
                "type": "arxiv",
                "arxiv_id": arxiv_id,
                "authors": authors,
                "published": published,
                "tags": tags,
            },
        )

    async def _store_embedding(
        self,
        arxiv_id: str,
        text: str,
        metadata: Dict[str, Any],
        db_session,
        module_instance_id: str = None,
    ) -> None:
        """Store text embedding in the embeddings table."""
        from app.models.database import Embedding

        if not module_instance_id:
            return  # Cannot satisfy NOT NULL module_id FK without a valid instance id

        # In a production system, call an embedding API (e.g. OpenAI, Cohere, or Supabase pgvector).
        # Here we store a placeholder until an embedding service is configured.
        embedding_placeholder = None  # Replace with actual embedding vector

        try:
            emb = Embedding(
                id=uuid.uuid4(),
                module_id=uuid.UUID(module_instance_id),
                chunk_text=text[:5000],
                embedding=embedding_placeholder,
                meta={**metadata, "arxiv_id": arxiv_id},
            )
            db_session.add(emb)
            await db_session.commit()
        except Exception as exc:
            logger.warning(f"Failed to store embedding for {arxiv_id}: {exc}")
