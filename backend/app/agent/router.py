"""backend/app/agent/router.py — Decides: chat reply vs. start_browser_task."""
from __future__ import annotations

import json
import logging

from app.llm.provider import ChatMessage, LLMProvider

logger = logging.getLogger(__name__)

ROUTER_SYSTEM = """\
You are Pilot, an AI assistant that can chat and also operate a real web browser on the user's behalf.

You have access to one tool: start_browser_task(goal: str, start_url: str | null).

Rules:
- If the user wants you to DO something on the web (search, book, buy, find, order, compare, check, open a site, fill a form, etc.) → call start_browser_task.
- If the user is just chatting, asking a question, or having a normal conversation → reply directly without calling the tool.
- Use the full conversation history so follow-ups like "now pick the cheaper one" or "go back" are understood as continuations.
- Never start a browser task for something that can be answered from knowledge alone.

Respond as JSON:
{
  "action": "chat" | "browser_task",
  "reply": "<streaming reply text if action=chat>",
  "goal": "<task description if action=browser_task>",
  "start_url": "<optional URL to navigate to first>"
}
"""


class RouterResult:
    def __init__(self, action: str, reply: str = "", goal: str = "", start_url: str | None = None):
        self.action = action  # "chat" | "browser_task"
        self.reply = reply
        self.goal = goal
        self.start_url = start_url


async def route(
    user_message: str,
    history: list[ChatMessage],
    llm: LLMProvider,
) -> RouterResult:
    """
    Decide whether to stream a chat reply or start a browser task.
    Returns RouterResult with .action, .reply, .goal, .start_url.
    """
    messages = list(history) + [{"role": "user", "content": user_message}]
    try:
        result = await llm.complete_json(messages, system=ROUTER_SYSTEM, max_tokens=512)
        action = result.get("action", "chat")
        if action == "browser_task":
            return RouterResult(
                action="browser_task",
                goal=result.get("goal", user_message),
                start_url=result.get("start_url") or None,
            )
        return RouterResult(action="chat", reply=result.get("reply", ""))
    except Exception as e:
        logger.warning("Router LLM error, defaulting to chat: %s", e)
        return RouterResult(action="chat", reply="I'm here. Something went wrong on my end — please try again.")
