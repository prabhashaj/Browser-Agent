"""
backend/app/voice/provider.py
==============================
Voice provider stub — Speech-to-Text and Text-to-Speech interfaces.

These are intentionally stubs for now; implement by swapping in a real
provider (Google Cloud Speech, Whisper, ElevenLabs, etc.) without
changing the interface.
"""
from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from typing import Protocol, runtime_checkable

logger = logging.getLogger(__name__)


@runtime_checkable
class STTProvider(Protocol):
    """Speech-to-Text: receives audio bytes, yields transcript strings."""
    async def transcribe_stream(self, audio_chunks: AsyncGenerator[bytes, None]) -> AsyncGenerator[str, None]:
        ...


@runtime_checkable
class TTSProvider(Protocol):
    """Text-to-Speech: receives text, yields audio bytes (PCM 16-bit 24kHz)."""
    async def synthesize_stream(self, text: str) -> AsyncGenerator[bytes, None]:
        ...


class StubSTT:
    """Stub STT — logs and returns empty transcript."""
    async def transcribe_stream(self, audio_chunks: AsyncGenerator[bytes, None]) -> AsyncGenerator[str, None]:
        logger.info("StubSTT: transcribe_stream called (no-op)")
        # Consume input
        async for _ in audio_chunks:
            pass
        # Yield nothing — implement with real provider
        return
        yield  # make this a generator


class StubTTS:
    """Stub TTS — logs and returns empty audio."""
    async def synthesize_stream(self, text: str) -> AsyncGenerator[bytes, None]:
        logger.info("StubTTS: synthesize('%s') called (no-op)", text[:40])
        return
        yield  # make this a generator


def get_stt() -> STTProvider:
    """Returns the configured STT provider."""
    return StubSTT()


def get_tts() -> TTSProvider:
    """Returns the configured TTS provider."""
    return StubTTS()
