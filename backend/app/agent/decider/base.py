"""
backend/app/agent/decider/base.py
===================================
Protocol for all action deciders (LLM, Jev, etc.)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from app.schemas.events import Operation


@dataclass
class DecisionInput:
    goal: str
    url: str
    page_text: str
    elements: list[dict]
    history: list[dict]  # list of {"step": str, "result": str}
    step_index: int


@dataclass
class DecisionOutput:
    operation: Operation
    element_index: int | None = None
    text: str | None = None          # for TYPE operation
    url: str | None = None           # for NAVIGATE operation
    reasoning: str = ""
    raw: dict = field(default_factory=dict)


@runtime_checkable
class Decider(Protocol):
    async def decide(self, inp: DecisionInput) -> DecisionOutput:
        """Return the next action to take."""
        ...
