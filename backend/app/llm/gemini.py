"""backend/app/llm/gemini.py — Google Gemini LLM provider."""
from __future__ import annotations

import json
from collections.abc import AsyncGenerator

import google.generativeai as genai

from app.llm.provider import ChatMessage


class GeminiProvider:
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash-exp"):
        genai.configure(api_key=api_key)
        self.model_name = model

    def _build_contents(self, messages: list[ChatMessage]) -> list[dict]:
        """Convert our ChatMessage format to Gemini's contents format."""
        contents = []
        for m in messages:
            role = "model" if m["role"] == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": m["content"]}]})
        return contents

    async def stream_chat(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 4096,
    ) -> AsyncGenerator[str, None]:
        model = genai.GenerativeModel(
            model_name=self.model_name,
            system_instruction=system,
            generation_config=genai.GenerationConfig(max_output_tokens=max_tokens),
        )
        contents = self._build_contents(messages)
        response = await model.generate_content_async(contents, stream=True)
        async for chunk in response:
            if chunk.text:
                yield chunk.text

    async def complete(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 2048,
    ) -> str:
        model = genai.GenerativeModel(
            model_name=self.model_name,
            system_instruction=system,
            generation_config=genai.GenerationConfig(max_output_tokens=max_tokens),
        )
        contents = self._build_contents(messages)
        response = await model.generate_content_async(contents)
        return response.text or ""

    async def complete_json(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 2048,
    ) -> dict:
        model = genai.GenerativeModel(
            model_name=self.model_name,
            system_instruction=system,
            generation_config=genai.GenerationConfig(
                max_output_tokens=max_tokens,
                response_mime_type="application/json",
            ),
        )
        contents = self._build_contents(messages)
        response = await model.generate_content_async(contents)
        text = response.text or "{}"
        # Strip markdown fences if present
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1].rsplit("```", 1)[0]
        return json.loads(text)
