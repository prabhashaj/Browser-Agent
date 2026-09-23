"""
backend/app/agent/executor.py
==============================
Executes a DecisionOutput on a Playwright page.

Safety contract:
  - All navigation goes through the SSRF guard (profiles.validate_url)
  - TYPE never logs the text content (to avoid secrets in logs)
  - All actions have stability waits after execution
"""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from app.agent.decider.base import DecisionOutput
from app.browser.profiles import SSRFError, validate_url
from app.schemas.events import Operation

if TYPE_CHECKING:
    from playwright.async_api import Page

logger = logging.getLogger(__name__)

# Wait time after each action (ms) to let the DOM settle
STABILITY_WAIT_MS = 800
NAV_TIMEOUT_MS = 30_000
ACTION_TIMEOUT_MS = 10_000


async def execute(page: Page, decision: DecisionOutput, elements: list[dict]) -> str:
    """
    Execute one DecisionOutput on the Playwright page.
    Returns a human-readable result string.
    Raises on critical failures.
    """
    op = decision.operation

    if op == Operation.CLICK:
        return await _click(page, decision, elements)
    elif op == Operation.TYPE:
        return await _type(page, decision, elements)
    elif op == Operation.SELECT:
        return await _select(page, decision, elements)
    elif op == Operation.SCROLL_DOWN:
        await page.evaluate("window.scrollBy(0, 400)")
        await asyncio.sleep(STABILITY_WAIT_MS / 1000)
        return "Scrolled down"
    elif op == Operation.SCROLL_UP:
        await page.evaluate("window.scrollBy(0, -400)")
        await asyncio.sleep(STABILITY_WAIT_MS / 1000)
        return "Scrolled up"
    elif op == Operation.NAVIGATE:
        return await _navigate(page, decision)
    elif op == Operation.BACK:
        await page.go_back(timeout=NAV_TIMEOUT_MS)
        await asyncio.sleep(STABILITY_WAIT_MS / 1000)
        return "Navigated back"
    elif op == Operation.WAIT:
        await asyncio.sleep(1.5)
        return "Waited"
    elif op in (Operation.DONE, Operation.BLOCKED):
        return f"{op.value} — {decision.reasoning}"
    else:
        logger.warning("Unknown operation: %s", op)
        return "Unknown operation (skipped)"


async def _get_element(page: Page, element_index: int | None, elements: list[dict]):
    """Return the Playwright ElementHandle for a given element index."""
    if element_index is None or not elements:
        raise ValueError("No element index for this action")

    # Find the element data with matching index
    el_data = next((e for e in elements if e["index"] == element_index), None)
    if not el_data:
        raise ValueError(f"Element {element_index} not found in snapshot")

    bbox = el_data.get("bbox", {})
    if not bbox:
        raise ValueError(f"Element {element_index} has no bounding box")

    # Click by center of bounding box (normalized → pixel)
    vp = page.viewport_size or {"width": 1280, "height": 800}
    x = (bbox["x"] + bbox["w"] / 2) * vp["width"]
    y = (bbox["y"] + bbox["h"] / 2) * vp["height"]
    return x, y


async def _click(page: Page, decision: DecisionOutput, elements: list[dict]) -> str:
    x, y = await _get_element(page, decision.element_index, elements)
    await page.mouse.click(x, y)
    await asyncio.sleep(STABILITY_WAIT_MS / 1000)
    return f"Clicked element {decision.element_index}"


async def _type(page: Page, decision: DecisionOutput, elements: list[dict]) -> str:
    x, y = await _get_element(page, decision.element_index, elements)
    await page.mouse.click(x, y)
    # Triple-click to select existing content
    await page.mouse.triple_click(x, y)
    text = decision.text or ""
    await page.keyboard.type(text, delay=30)
    await asyncio.sleep(STABILITY_WAIT_MS / 1000)
    # Log operation but NOT the text content (may be a secret)
    return f"Typed into element {decision.element_index}"


async def _select(page: Page, decision: DecisionOutput, elements: list[dict]) -> str:
    if decision.element_index is None:
        raise ValueError("SELECT requires an element_index")
    x, y = await _get_element(page, decision.element_index, elements)
    await page.mouse.click(x, y)
    if decision.text:
        # Try select_option on an actual <select>
        el = await page.query_selector(f"select:nth-child({decision.element_index})")
        if el:
            await el.select_option(label=decision.text)
        else:
            # Generic click on the option text
            option = page.get_by_text(decision.text).first
            if await option.count():
                await option.click()
    await asyncio.sleep(STABILITY_WAIT_MS / 1000)
    return f"Selected '{decision.text}' in element {decision.element_index}"


async def _navigate(page: Page, decision: DecisionOutput) -> str:
    url = decision.url or ""
    if not url:
        raise ValueError("NAVIGATE requires a url")
    try:
        url = validate_url(url)
    except SSRFError as e:
        raise RuntimeError(f"Navigation blocked: {e}") from e
    await page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
    await asyncio.sleep(STABILITY_WAIT_MS / 1000)
    return f"Navigated to {url}"
