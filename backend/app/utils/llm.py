import json
import logging
from typing import Any, Optional

import anthropic

logger = logging.getLogger(__name__)

MODEL_ID = "claude-sonnet-4-5-20251001"
MAX_TOKENS_LIMIT = 80_000
# Rough estimate: 1 token ≈ 4 chars
_CHARS_PER_TOKEN = 4


class LLMExtractor:
    def __init__(self):
        self.client = anthropic.AsyncAnthropic()

    def _estimate_tokens(self, *texts: str) -> int:
        total_chars = sum(len(t) for t in texts)
        return total_chars // _CHARS_PER_TOKEN

    async def extract_structured(
        self,
        content: str,
        schema: dict,
        system_prompt: str,
    ) -> dict:
        """
        Call Claude with tool_use for structured extraction.
        Returns a validated dict matching the provided JSON schema.
        Falls back to {} if the output is malformed.
        Refuses if estimated token count > 80k.
        """
        estimated_tokens = self._estimate_tokens(content, system_prompt, json.dumps(schema))
        if estimated_tokens > MAX_TOKENS_LIMIT:
            logger.warning(
                f"Content too large for structured extraction: ~{estimated_tokens} tokens estimated. Skipping."
            )
            return {}

        tool_name = "extract_data"
        tool_definition = {
            "name": tool_name,
            "description": "Extract structured data from the provided content according to the schema.",
            "input_schema": schema,
        }

        try:
            response = await self.client.messages.create(
                model=MODEL_ID,
                max_tokens=4096,
                system=system_prompt,
                tools=[tool_definition],
                tool_choice={"type": "tool", "name": tool_name},
                messages=[
                    {
                        "role": "user",
                        "content": f"Extract structured data from the following content:\n\n{content}",
                    }
                ],
            )

            # Find the tool_use block
            for block in response.content:
                if block.type == "tool_use" and block.name == tool_name:
                    return block.input or {}

            logger.warning("LLM did not return a tool_use block")
            return {}

        except anthropic.APIError as exc:
            logger.error(f"Anthropic API error in extract_structured: {exc}")
            return {}
        except Exception as exc:
            logger.error(f"Unexpected error in extract_structured: {exc}")
            return {}

    async def semantic_diff(self, old_content: str, new_content: str) -> dict:
        """
        Ask Claude what changed semantically between old and new content.
        Returns {changed: bool, summary: str, change_type: str}.
        """
        estimated_tokens = self._estimate_tokens(old_content, new_content)
        if estimated_tokens > MAX_TOKENS_LIMIT:
            # Truncate to fit
            max_chars = (MAX_TOKENS_LIMIT // 2) * _CHARS_PER_TOKEN
            old_content = old_content[:max_chars]
            new_content = new_content[:max_chars]
            logger.warning("Content truncated for semantic_diff due to size")

        tool_definition = {
            "name": "semantic_diff_result",
            "description": "Return the semantic diff analysis result.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "changed": {
                        "type": "boolean",
                        "description": "Whether meaningful content has changed",
                    },
                    "summary": {
                        "type": "string",
                        "description": "Human-readable summary of what changed",
                    },
                    "change_type": {
                        "type": "string",
                        "description": "Type of change: price_change, content_update, new_section, removal, no_change",
                        "enum": ["price_change", "content_update", "new_section", "removal", "no_change"],
                    },
                },
                "required": ["changed", "summary", "change_type"],
            },
        }

        system_prompt = (
            "You are a content diff analyzer. Compare the OLD and NEW versions of a webpage or document "
            "and identify meaningful semantic changes. Ignore trivial formatting differences. "
            "Focus on: price changes, new features, removed features, organizational changes, and key updates."
        )

        user_message = f"OLD VERSION:\n{old_content[:15000]}\n\nNEW VERSION:\n{new_content[:15000]}"

        try:
            response = await self.client.messages.create(
                model=MODEL_ID,
                max_tokens=1024,
                system=system_prompt,
                tools=[tool_definition],
                tool_choice={"type": "tool", "name": "semantic_diff_result"},
                messages=[{"role": "user", "content": user_message}],
            )

            for block in response.content:
                if block.type == "tool_use" and block.name == "semantic_diff_result":
                    return block.input or {"changed": False, "summary": "No data", "change_type": "no_change"}

            return {"changed": False, "summary": "Could not analyze", "change_type": "no_change"}

        except Exception as exc:
            logger.error(f"semantic_diff error: {exc}")
            return {"changed": False, "summary": f"Analysis failed: {exc}", "change_type": "no_change"}

    async def analyze_text(self, prompt: str, content: str, max_tokens: int = 2048) -> str:
        """
        Simple free-form text analysis. Returns the assistant's text response.
        """
        estimated_tokens = self._estimate_tokens(prompt, content)
        if estimated_tokens > MAX_TOKENS_LIMIT:
            content = content[: MAX_TOKENS_LIMIT * _CHARS_PER_TOKEN // 2]

        try:
            response = await self.client.messages.create(
                model=MODEL_ID,
                max_tokens=max_tokens,
                messages=[
                    {
                        "role": "user",
                        "content": f"{prompt}\n\n{content}",
                    }
                ],
            )
            text_blocks = [b.text for b in response.content if hasattr(b, "text")]
            return "\n".join(text_blocks)
        except Exception as exc:
            logger.error(f"analyze_text error: {exc}")
            return ""


# Singleton
llm_extractor = LLMExtractor()
