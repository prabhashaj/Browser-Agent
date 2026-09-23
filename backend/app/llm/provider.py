"""backend/app/llm/provider.py — LLM provider protocol + factory."""
from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Protocol, runtime_checkable

from app.config import get_settings


class ChatMessage(dict):
    """Simple message dict: {"role": "user"|"assistant"|"system", "content": str}"""


@runtime_checkable
class LLMProvider(Protocol):
    async def stream_chat(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 4096,
    ) -> AsyncGenerator[str, None]:
        """Yield text deltas as they stream from the LLM."""
        ...

    async def complete(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 2048,
    ) -> str:
        """Return the full completion synchronously."""
        ...

    async def complete_json(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 2048,
    ) -> dict:
        """Return parsed JSON. Provider should enable JSON mode if available."""
        ...


def get_primary_llm() -> LLMProvider:
    """Return the configured primary LLM provider."""
    settings = get_settings()
    if settings.gemini_api_key:
        from app.llm.gemini import GeminiProvider
        return GeminiProvider(api_key=settings.gemini_api_key)
    if settings.anthropic_api_key:
        from app.llm.anthropic import AnthropicProvider
        return AnthropicProvider(api_key=settings.anthropic_api_key)
    raise RuntimeError("No LLM API key configured. Set GEMINI_API_KEY or ANTHROPIC_API_KEY in .env")
