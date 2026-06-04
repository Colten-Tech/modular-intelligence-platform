import json
import logging

from groq import AsyncGroq

logger = logging.getLogger(__name__)

MODEL_ID = "llama-3.3-70b-versatile"
MAX_TOKENS_LIMIT = 80_000
_CHARS_PER_TOKEN = 4


class LLMExtractor:
    def __init__(self):
        self.client = AsyncGroq()   # reads GROQ_API_KEY from env automatically

    def _estimate_tokens(self, *texts: str) -> int:
        return sum(len(t) for t in texts) // _CHARS_PER_TOKEN

    async def extract_structured(
        self,
        content: str,
        schema: dict,
        system_prompt: str,
    ) -> dict:
        """
        Call Llama 3.3 70B via Groq with JSON mode for structured extraction.
        Returns a validated dict matching the provided JSON schema.
        Falls back to {} if the output is malformed or the API is unavailable.
        """
        if self._estimate_tokens(content, system_prompt, json.dumps(schema)) > MAX_TOKENS_LIMIT:
            logger.warning("Content too large for structured extraction — skipping LLM call")
            return {}

        try:
            response = await self.client.chat.completions.create(
                model=MODEL_ID,
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            f"{system_prompt}\n\n"
                            f"Respond ONLY with a valid JSON object that matches this schema:\n"
                            f"{json.dumps(schema, indent=2)}"
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Extract structured data from the following content:\n\n{content[:60_000]}",
                    },
                ],
            )
            raw = response.choices[0].message.content or "{}"
            return json.loads(raw)

        except json.JSONDecodeError as exc:
            logger.error(f"LLM returned invalid JSON: {exc}")
            return {}
        except Exception as exc:
            logger.error(f"Groq API error in extract_structured: {exc}")
            return {}

    async def semantic_diff(self, old_content: str, new_content: str) -> dict:
        """
        Ask the LLM what changed semantically between old and new content.
        Returns {changed: bool, summary: str, change_type: str}.
        """
        diff_schema = {
            "type": "object",
            "properties": {
                "changed":     {"type": "boolean"},
                "summary":     {"type": "string"},
                "change_type": {
                    "type": "string",
                    "enum": ["price_change", "content_update", "new_section", "removal", "no_change"],
                },
            },
            "required": ["changed", "summary", "change_type"],
        }

        system = (
            "You are a content diff analyzer. Compare OLD and NEW versions of a document and "
            "identify meaningful semantic changes. Ignore trivial formatting differences. "
            "Focus on: price changes, new features, removals, and key updates. "
            f"Respond with JSON matching this schema: {json.dumps(diff_schema)}"
        )

        try:
            response = await self.client.chat.completions.create(
                model=MODEL_ID,
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": f"OLD:\n{old_content[:10_000]}\n\nNEW:\n{new_content[:10_000]}"},
                ],
            )
            return json.loads(response.choices[0].message.content or "{}")
        except Exception as exc:
            logger.error(f"semantic_diff error: {exc}")
            return {"changed": False, "summary": f"Analysis failed: {exc}", "change_type": "no_change"}

    async def analyze_text(self, prompt: str, content: str, max_tokens: int = 2048) -> str:
        """Free-form text analysis. Returns the assistant's text response."""
        if self._estimate_tokens(prompt, content) > MAX_TOKENS_LIMIT:
            content = content[: MAX_TOKENS_LIMIT * _CHARS_PER_TOKEN // 2]

        try:
            response = await self.client.chat.completions.create(
                model=MODEL_ID,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": f"{prompt}\n\n{content}"}],
            )
            return response.choices[0].message.content or ""
        except Exception as exc:
            logger.error(f"analyze_text error: {exc}")
            return ""


# Singleton
llm_extractor = LLMExtractor()
