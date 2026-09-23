"""backend/app/llm/anthropic.py — Anthropic Claude LLM provider."""
from __future__ import annotations

import json
from collections.abc import AsyncGenerator

import anthropic as anth

from app.llm.provider import ChatMessage


class AnthropicProvider:
    def __init__(self, api_key: str, model: str = "claude-3-5-sonnet-20241022"):
        self.client = anth.AsyncAnthropic(api_key=api_key)
        self.model = model

    def _build_messages(self, messages: list[ChatMessage]) -> list[dict]:
        return [{"role": m["role"], "content": m["content"]} for m in messages]

    async def stream_chat(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 4096,
    ) -> AsyncGenerator[str, None]:
        kwargs: dict = dict(model=self.model, max_tokens=max_tokens, messages=self._build_messages(messages))
        if system:
            kwargs["system"] = system
        async with self.client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text

    async def complete(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 2048,
    ) -> str:
        kwargs: dict = dict(model=self.model, max_tokens=max_tokens, messages=self._build_messages(messages))
        if system:
            kwargs["system"] = system
        response = await self.client.messages.create(**kwargs)
        return response.content[0].text if response.content else ""

    async def complete_json(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 2048,
    ) -> dict:
        # Anthropic doesn't have a native JSON mode; we instruct via system prompt
        json_system = (system or "") + "\nYou MUST respond with valid JSON only. No markdown, no explanation."
        text = await self.complete(messages, system=json_system.strip(), max_tokens=max_tokens)
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1].rsplit("```", 1)[0]
        return json.loads(text)
