"""
backend/app/browser/session_manager.py
========================================
Per-run Playwright browser context management.

Each run gets:
  - An isolated BrowserContext with a unique user data dir
  - A main Page with CDP screencast enabled
  - A ScreencastSession that pushes FrameEvents to the run queue

Usage:
    async with BrowserSession(run_id, settings, emit_fn) as session:
        await session.navigate("https://example.com")
        # session.page is a Playwright Page
        # session.tabs() returns tab list
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import TYPE_CHECKING

from app.browser.profiles import SSRFError, validate_url
from app.browser.screencast import ScreencastSession, get_page_snapshot
from app.config import Settings

if TYPE_CHECKING:
    from playwright.async_api import Browser, BrowserContext, Page

logger = logging.getLogger(__name__)

# Singleton browser instance shared across all sessions
_browser: "Browser | None" = None
_browser_lock = asyncio.Lock()


async def _get_browser(headless: bool = True) -> "Browser":
    global _browser
    async with _browser_lock:
        if _browser is None or not _browser.is_connected():
            from playwright.async_api import async_playwright
            pw = await async_playwright().start()
            _browser = await pw.chromium.launch(
                headless=headless,
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-extensions",
                    "--disable-background-networking",
                    "--disable-sync",
                    "--disable-translate",
                    "--metrics-recording-only",
                    "--mute-audio",
                    "--no-first-run",
                ],
            )
            logger.info("Playwright browser launched (headless=%s)", headless)
        return _browser


class BrowserTab:
    def __init__(self, page: "Page", tab_id: str):
        self.page = page
        self.tab_id = tab_id
        self.screencast: ScreencastSession | None = None

    @property
    def url(self) -> str:
        return self.page.url

    @property
    def title_cached(self) -> str:
        return getattr(self, "_title", "New tab")

    def set_title(self, t: str) -> None:
        self._title = t  # noqa: SLF001


class BrowserSession:
    """
    Context manager for a per-run isolated browser context + screencast.
    """

    def __init__(
        self,
        run_id: str,
        settings: Settings,
        emit: "callable",  # async (event: dict) -> None
    ):
        self.run_id = run_id
        self.settings = settings
        self._emit = emit
        self._context: "BrowserContext | None" = None
        self._tabs: list[BrowserTab] = []
        self._active_tab_id: str | None = None
        self._closed = False

    async def __aenter__(self) -> "BrowserSession":
        browser = await _get_browser(headless=True)
        self._context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="en-US",
            timezone_id="America/New_York",
        )
        # Intercept new pages (popups)
        self._context.on("page", self._on_new_page)
        # Open initial blank tab
        page = await self._context.new_page()
        await self._add_tab(page)
        return self

    async def __aexit__(self, *_) -> None:
        await self.close()

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        for tab in self._tabs:
            if tab.screencast:
                await tab.screencast.stop()
        if self._context:
            try:
                await self._context.close()
            except Exception:
                pass
        logger.info("BrowserSession closed for run %s", self.run_id)

    # ── Tab management ─────────────────────────────────────────────────────────

    async def _add_tab(self, page: "Page") -> BrowserTab:
        tab_id = str(uuid.uuid4())[:8]
        tab = BrowserTab(page, tab_id)

        # Start screencast
        sc = ScreencastSession(
            page=page,
            run_id=self.run_id,
            tab_id=tab_id,
            fps=self.settings.screencast_fps,
            quality=self.settings.screencast_quality,
        )
        sc.set_frame_callback(self._on_frame(tab_id))
        await sc.start()
        tab.screencast = sc

        # Page event listeners
        page.on("close", lambda: asyncio.ensure_future(self._on_page_close(tab_id)))
        page.on("framenavigated", lambda frame: asyncio.ensure_future(self._on_navigate(tab_id, frame)))

        self._tabs.append(tab)
        if self._active_tab_id is None:
            self._active_tab_id = tab_id

        await self._emit_tabs()
        return tab

    def _on_frame(self, tab_id: str):
        """Returns an async callback for screencast frames for this tab."""
        async def callback(data: str, viewport: dict) -> None:
            await self._emit({
                "type": "frame",
                "tab_id": tab_id,
                "mime": "image/jpeg",
                "data": data,
                "viewport": viewport,
            })
        return callback

    async def _on_new_page(self, page: "Page") -> None:
        await self._add_tab(page)

    async def _on_page_close(self, tab_id: str) -> None:
        self._tabs = [t for t in self._tabs if t.tab_id != tab_id]
        if self._active_tab_id == tab_id and self._tabs:
            self._active_tab_id = self._tabs[-1].tab_id
        await self._emit_tabs()

    async def _on_navigate(self, tab_id: str, frame) -> None:
        if frame.parent_frame is not None:
            return  # Only care about main frame
        for tab in self._tabs:
            if tab.tab_id == tab_id:
                try:
                    title = await tab.page.title()
                    tab.set_title(title)
                except Exception:
                    pass
        await self._emit_tabs()

    async def _emit_tabs(self) -> None:
        tabs = []
        for tab in self._tabs:
            try:
                title = await tab.page.title() or tab.url or "New tab"
            except Exception:
                title = tab.url or "New tab"
            tabs.append({
                "id": tab.tab_id,
                "title": title[:120],
                "url": tab.url,
                "loading": False,
                "active": tab.tab_id == self._active_tab_id,
            })
        await self._emit({"type": "tabs_updated", "tabs": tabs})

    # ── Navigation ─────────────────────────────────────────────────────────────

    async def navigate(self, url: str) -> None:
        """Navigate the active tab to url (with SSRF guard)."""
        try:
            url = validate_url(url)
        except SSRFError as e:
            logger.warning("SSRF blocked: %s", e)
            raise

        tab = self._active_tab()
        if tab is None:
            raise RuntimeError("No active tab")

        await self._emit({"type": "tabs_updated", "tabs": await self._tab_dicts(loading=True)})
        try:
            await tab.page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        finally:
            await self._emit_tabs()

    async def _tab_dicts(self, loading: bool = False) -> list[dict]:
        result = []
        for tab in self._tabs:
            try:
                title = await tab.page.title() or tab.url or "New tab"
            except Exception:
                title = tab.url or "New tab"
            result.append({
                "id": tab.tab_id,
                "title": title[:120],
                "url": tab.url,
                "loading": loading and tab.tab_id == self._active_tab_id,
                "active": tab.tab_id == self._active_tab_id,
            })
        return result

    # ── Accessors ──────────────────────────────────────────────────────────────

    def _active_tab(self) -> BrowserTab | None:
        for tab in self._tabs:
            if tab.tab_id == self._active_tab_id:
                return tab
        return self._tabs[-1] if self._tabs else None

    @property
    def page(self) -> "Page":
        """Return the active Playwright Page."""
        tab = self._active_tab()
        if tab is None:
            raise RuntimeError("No active tab")
        return tab.page

    async def screenshot_b64(self) -> str:
        """Take a one-shot screenshot of the active page."""
        return await get_page_snapshot(self.page)
