"""
backend/app/browser/screencast.py
==================================
Captures CDP screencast frames from a Playwright page and pushes them
as FrameEvent dicts onto the run's event queue.
"""
from __future__ import annotations

import asyncio
import base64
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from playwright.async_api import Page

logger = logging.getLogger(__name__)


class ScreencastSession:
    """
    Wraps a Playwright page and drives CDP screencast.
    Frames are emitted as FrameEvent-compatible dicts.
    """

    def __init__(
        self,
        page: "Page",
        run_id: str,
        tab_id: str,
        fps: int = 10,
        quality: int = 75,
    ):
        self.page = page
        self.run_id = run_id
        self.tab_id = tab_id
        self.fps = fps
        self.quality = quality
        self._task: asyncio.Task | None = None
        self._cdp = None
        self._stopped = False
        self._emit_cb: "asyncio.coroutines.Coroutine | None" = None
        self._on_frame = None  # set by caller

    def set_frame_callback(self, cb):
        """Set an async callback (frame_b64: str, viewport: dict) → None."""
        self._on_frame = cb

    async def start(self):
        """Start the CDP screencast loop."""
        if self._stopped:
            return
        self._cdp = await self.page.context.new_cdp_session(self.page)
        await self._cdp.send("Page.startScreencast", {
            "format": "jpeg",
            "quality": self.quality,
            "maxWidth": 1280,
            "maxHeight": 800,
            "everyNthFrame": max(1, 60 // self.fps),
        })
        self._cdp.on("Page.screencastFrame", self._handle_frame)
        logger.info("Screencast started for run %s tab %s", self.run_id, self.tab_id)

    def _handle_frame(self, params: dict):
        """Called by playwright for each CDP screencast frame."""
        if self._stopped or self._on_frame is None:
            return
        data: str = params.get("data", "")
        session_id: int = params.get("sessionId", 0)
        metadata = params.get("metadata", {})
        viewport = {
            "w": int(metadata.get("deviceWidth", 1280)),
            "h": int(metadata.get("deviceHeight", 800)),
        }
        # Ack the frame so CDP keeps sending
        if self._cdp and session_id:
            asyncio.ensure_future(
                self._cdp.send("Page.screencastFrameAck", {"sessionId": session_id})
            )
        if self._on_frame:
            asyncio.ensure_future(self._on_frame(data, viewport))

    async def stop(self):
        """Stop the screencast session cleanly."""
        self._stopped = True
        if self._cdp:
            try:
                await self._cdp.send("Page.stopScreencast")
            except Exception:
                pass
            self._cdp = None
        logger.info("Screencast stopped for run %s tab %s", self.run_id, self.tab_id)


async def get_page_snapshot(page: "Page") -> str:
    """Capture a single JPEG screenshot and return as base64."""
    try:
        data = await page.screenshot(type="jpeg", quality=75, full_page=False)
        return base64.b64encode(data).decode()
    except Exception as e:
        logger.warning("Screenshot failed: %s", e)
        return ""
