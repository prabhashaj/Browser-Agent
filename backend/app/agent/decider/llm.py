"""
backend/app/agent/decider/llm.py
===================================
LLM-based decider. Uses the configured LLM to choose the next browser action.
"""
from __future__ import annotations

import logging

from app.agent.decider.base import DecisionInput, DecisionOutput
from app.llm.provider import ChatMessage, LLMProvider
from app.schemas.events import Operation

logger = logging.getLogger(__name__)

SYSTEM = """\
You are Pilot, an AI that controls a web browser to complete tasks.

You receive: the GOAL, the current URL, visible page text, and an ELEMENTS list.
Each element has: index, kind (button/textbox/combobox/link), label, value (if filled).

You must choose ONE action from this list:
  CLICK         index=<n>
  TYPE          index=<n>  text="<value>"
  SELECT        index=<n>  text="<option>"
  SCROLL_UP     (no index)
  SCROLL_DOWN   (no index)
  NAVIGATE      url="<url>"
  BACK          (no index)
  WAIT          (no index)
  DONE          (no index) — task is complete
  BLOCKED       (no index) — cannot complete; explain in reasoning

Rules:
- Prefer CLICK and TYPE over NAVIGATE unless you need to go to a specific known URL.
- If a form field is already filled correctly, don't retype it.
- Never invent element indexes not in the list.
- If the page is blank or navigation is needed first, use NAVIGATE.
- When you believe the task is done (result visible, confirmation shown), output DONE.
- Keep reasoning concise (1-2 sentences).

Respond with a JSON object:
{
  "operation": "CLICK"|"TYPE"|"SELECT"|"SCROLL_UP"|"SCROLL_DOWN"|"NAVIGATE"|"BACK"|"WAIT"|"DONE"|"BLOCKED",
  "element_index": <n or null>,
  "text": "<text for TYPE/SELECT or null>",
  "url": "<url for NAVIGATE or null>",
  "reasoning": "<1-2 sentence explanation>"
}
"""


def _format_elements(elements: list[dict]) -> str:
    if not elements:
        return "(no interactive elements found)"
    lines = []
    for el in elements:
        val_part = f'  val="{el.get("value", "")}"' if el.get("value") else ""
        lines.append(f'  [{el["index"]}] {el["kind"]}: {el["label"]}{val_part}')
    return "\n".join(lines[:60])  # keep prompt short


class LLMDecider:
    def __init__(self, llm: LLMProvider):
        self.llm = llm

    async def decide(self, inp: DecisionInput) -> DecisionOutput:
        history_text = ""
        if inp.history:
            lines = [f"  {i+1}. {h['step']}: {h['result']}" for i, h in enumerate(inp.history[-8:])]
            history_text = "PREVIOUS STEPS:\n" + "\n".join(lines) + "\n\n"

        user_content = f"""{history_text}GOAL: {inp.goal}

CURRENT URL: {inp.url}

ELEMENTS:
{_format_elements(inp.elements)}

PAGE TEXT (first 2000 chars):
{inp.page_text[:2000]}

STEP {inp.step_index + 1}: What is the next single action?"""

        messages: list[ChatMessage] = [{"role": "user", "content": user_content}]
        try:
            result = await self.llm.complete_json(messages, system=SYSTEM, max_tokens=512)
            op_str = str(result.get("operation", "WAIT")).upper()
            try:
                operation = Operation(op_str)
            except ValueError:
                logger.warning("Unknown operation %r, defaulting to WAIT", op_str)
                operation = Operation.WAIT
            ei = result.get("element_index")
            return DecisionOutput(
                operation=operation,
                element_index=int(ei) if ei is not None else None,
                text=result.get("text") or None,
                url=result.get("url") or None,
                reasoning=str(result.get("reasoning", "")),
                raw=result,
            )
        except Exception as e:
            logger.warning("LLM decider error: %s", e)
            return DecisionOutput(operation=Operation.WAIT, reasoning=f"LLM error: {e}")
