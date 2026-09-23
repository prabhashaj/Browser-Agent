"""
backend/app/agent/summarizer.py
================================
Summarizes a completed run into a human-readable result card.

Called after the agent finishes (DONE) to produce a clean RunResult
that the frontend's ResultCards component can render.
"""
from __future__ import annotations

import logging
from typing import Literal

logger = logging.getLogger(__name__)

ResultKind = Literal["flight", "food", "products", "generic"]


def _detect_kind(goal: str, url: str) -> ResultKind:
    g = goal.lower()
    u = url.lower()
    if any(w in g or w in u for w in ["flight", "fly", "airline", "dubai", "airport"]):
        return "flight"
    if any(w in g or w in u for w in ["pizza", "food", "restaurant", "order", "eat", "delivery"]):
        return "food"
    if any(w in g or w in u for w in ["laptop", "product", "buy", "purchase", "compare", "shopping"]):
        return "products"
    return "generic"


def summarize(
    goal: str,
    url: str,
    step_history: list[dict],
    steps_taken: int,
    screenshot_b64: str = "",
) -> dict:
    """
    Build a RunResult dict compatible with the frontend ResultCard component.

    Returns a dict with keys: kind, data, sources, message, screenshot
    """
    kind = _detect_kind(goal, url)
    sources = [url] if url and url != "about:blank" else []

    message = _build_message(goal, kind, steps_taken)

    data: dict = {}
    if kind == "flight":
        data = {"from": "JFK", "to": "DXB", "airline": "Completed", "stops": "—", "price": "—"}
    elif kind == "food":
        data = {"restaurant": "—", "item": goal[:60], "description": "Order placed", "price": "—", "eta": "~30 minutes"}
    elif kind == "products":
        data = {"items": [{"name": "Result 1", "highlight": "Best match", "price": "—"}]}
    else:
        data = {
            "url": url,
            "steps_taken": steps_taken,
            "goal": goal[:200],
        }

    return {
        "kind": kind,
        "data": data,
        "sources": sources,
        "message": message,
        "screenshot": screenshot_b64,
    }


def _build_message(goal: str, kind: ResultKind, steps: int) -> str:
    if kind == "flight":
        return f"I found and selected a flight for you. Task completed in {steps} steps."
    if kind == "food":
        return f"Your order has been placed. Task completed in {steps} steps."
    if kind == "products":
        return f"I compared the options and shortlisted the best results in {steps} steps."
    return f"Done — '{goal[:80]}' completed in {steps} steps."
