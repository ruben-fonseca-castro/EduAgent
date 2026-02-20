"""Lesson engine LLM configuration — adapts the main app's settings to LangChain models.

Supports two backends in priority order:
1. Oracle OCI GenAI (via a custom LangChain wrapper) — when OCI is configured
2. Anthropic Claude (via langchain-anthropic)          — when ANTHROPIC_API_KEY is set

This means the lesson engine works with whatever AI provider the app already uses.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator, Iterator, List, Optional, Sequence

from app.config import settings


def _oracle_configured() -> bool:
    return bool(
        settings.OCI_CONFIG_FILE
        and settings.OCI_CONFIG_PROFILE
        and settings.ORACLE_GENAI_MODEL
        and settings.ORACLE_GENAI_COMPARTMENT_ID
    )


def _anthropic_configured() -> bool:
    return bool(settings.ANTHROPIC_API_KEY)


# ─────────────────────────────────────────────────────────────────────────────
# OCI GenAI wrapper — makes Oracle OCI behave like a LangChain LLM
# ─────────────────────────────────────────────────────────────────────────────

class OCIGenAILangChainLLM:
    """
    A LangChain-compatible wrapper around the app's existing Oracle OCI GenAI client.

    Implements the subset of LangChain ChatModel interface used by the lesson engine:
      - ainvoke(messages)
      - astream(messages)
      - with_structured_output(schema)
    """

    def __init__(self, temperature: float = 0.7, max_tokens: int = 4096, streaming: bool = False):
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.streaming = streaming

    def _messages_to_system_and_list(self, messages) -> tuple[str, list[dict]]:
        """Convert LangChain messages to (system_str, messages_list) for ai_client.chat()."""
        from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

        system = ""
        msg_list = []
        for m in messages:
            if isinstance(m, SystemMessage):
                system = m.content
            elif isinstance(m, HumanMessage):
                msg_list.append({"role": "user", "content": m.content})
            elif isinstance(m, AIMessage):
                msg_list.append({"role": "assistant", "content": m.content})
            elif hasattr(m, "type"):
                if m.type == "system":
                    system = m.content
                elif m.type in ("human", "user"):
                    msg_list.append({"role": "user", "content": m.content})
                elif m.type in ("ai", "assistant"):
                    msg_list.append({"role": "assistant", "content": m.content})

        # Must have at least one user message
        if not msg_list:
            msg_list = [{"role": "user", "content": "Hello"}]

        return system, msg_list

    async def ainvoke(self, messages, **kwargs):
        from app.services.ai_client import chat as ai_chat
        system, msg_list = self._messages_to_system_and_list(messages)
        result = await ai_chat(
            system=system,
            messages=msg_list,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
        )
        return _make_ai_message(result)

    async def astream(self, messages, **kwargs):
        """OCI doesn't support streaming easily, so simulate by yielding the full response."""
        result_msg = await self.ainvoke(messages, **kwargs)
        # Yield the full content as one chunk (OCI doesn't support real streaming)
        yield result_msg

    def with_structured_output(self, schema) -> "_StructuredOutputWrapper":
        """Return a wrapper that parses JSON output into the schema."""
        return _StructuredOutputWrapper(self, schema)

    @property
    def content(self):
        return ""


def _make_ai_message(content: str):
    """Create a proper LangChain AIMessage from content string."""
    from langchain_core.messages import AIMessage
    return AIMessage(content=content)


class _StructuredOutputWrapper:
    """Wraps an LLM to parse its output as a Pydantic model via JSON."""

    def __init__(self, llm: OCIGenAILangChainLLM, schema):
        self.llm = llm
        self.schema = schema

    async def ainvoke(self, messages, **kwargs):
        from langchain_core.messages import HumanMessage

        # Add JSON format instruction to the last human message
        modified_messages = list(messages)
        schema_json = json.dumps(self.schema.model_json_schema(), indent=2)

        # Append format instructions to the last user message
        last_human_idx = None
        for i, m in enumerate(modified_messages):
            if hasattr(m, "type") and m.type in ("human", "user"):
                last_human_idx = i
            elif hasattr(m, "__class__") and "Human" in m.__class__.__name__:
                last_human_idx = i

        if last_human_idx is not None:
            original_content = modified_messages[last_human_idx].content
            format_instructions = (
                f"\n\nYou MUST respond with ONLY a valid JSON object matching this schema. "
                f"Do not include any text outside the JSON.\n\nSchema:\n{schema_json}"
            )
            modified_messages[last_human_idx] = HumanMessage(
                content=original_content + format_instructions
            )

        result_msg = await self.llm.ainvoke(modified_messages, **kwargs)
        raw = result_msg.content

        # Extract JSON from response
        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0].strip()

        # Find JSON object/array in the response
        raw = raw.strip()
        # Try to find the first { or [
        for start_char, end_char in [('{', '}'), ('[', ']')]:
            if start_char in raw:
                start = raw.index(start_char)
                # Find the last matching closing bracket
                depth = 0
                end = -1
                for i, ch in enumerate(raw[start:], start):
                    if ch == start_char:
                        depth += 1
                    elif ch == end_char:
                        depth -= 1
                        if depth == 0:
                            end = i
                            break
                if end > start:
                    raw = raw[start:end + 1]
                    break

        try:
            parsed = json.loads(raw)
            return self.schema(**parsed)
        except Exception as e:
            # Return a default/empty instance on parse failure
            try:
                return self.schema.model_validate({})
            except Exception:
                raise ValueError(f"Could not parse structured output: {e}\nRaw: {raw[:500]}")


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def get_llm(streaming: bool = False):
    """Get the main LLM for lesson generation.

    Uses Oracle OCI GenAI if configured, falls back to Anthropic.
    """
    if _oracle_configured():
        return OCIGenAILangChainLLM(
            temperature=settings.LESSON_LLM_TEMPERATURE,
            max_tokens=4096,
            streaming=streaming,
        )

    api_key = settings.ANTHROPIC_API_KEY
    if api_key:
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model="claude-sonnet-4-20250514",
            api_key=api_key,
            temperature=settings.LESSON_LLM_TEMPERATURE,
            max_tokens=4096,
            streaming=streaming,
        )

    raise ValueError(
        "No AI provider configured for lesson generation. "
        "Set OCI_CONFIG_FILE + ORACLE_GENAI_COMPARTMENT_ID + ORACLE_GENAI_MODEL "
        "or ANTHROPIC_API_KEY in backend/.env"
    )


def get_small_llm(streaming: bool = False):
    """Get a lightweight LLM for parsing tasks.

    Uses Oracle OCI GenAI if configured (same model, lower token budget),
    falls back to Anthropic Haiku.
    """
    if _oracle_configured():
        return OCIGenAILangChainLLM(
            temperature=0.3,
            max_tokens=2048,
            streaming=streaming,
        )

    api_key = settings.ANTHROPIC_API_KEY
    if api_key:
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model="claude-haiku-4-5-20251001",
            api_key=api_key,
            temperature=0.3,
            max_tokens=2048,
            streaming=streaming,
        )

    raise ValueError(
        "No AI provider configured for lesson generation. "
        "Set OCI_CONFIG_FILE + ORACLE_GENAI_COMPARTMENT_ID + ORACLE_GENAI_MODEL "
        "or ANTHROPIC_API_KEY in backend/.env"
    )
