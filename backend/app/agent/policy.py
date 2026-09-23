"""
backend/app/agent/policy.py
=============================
Deterministic policy gate — all rules evaluated BEFORE executing any action.

Rules are fast, purely deterministic, and never hit the LLM.
If any rule BLOCKS, the orchestrator emits an 'approval_required' or 'blocked' event.

Design principles:
  - Never block on I/O
  - Log every decision (policy_event in audit log)
  - The LLM can NOT override policy; policy runs after the LLM decides
"""
from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass, field
from enum import StrEnum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

# Domains where PAYMENT actions require approval
PAYMENT_DOMAINS = frozenset({
    "paypal.com", "stripe.com", "checkout.stripe.com",
    "pay.amazon.com", "venmo.com", "cashapp.com",
    "apple.com", "payments.google.com",
})

# URL patterns that always require approval (financial, admin, destructive)
HIGH_RISK_URL_PATTERNS = [
    re.compile(r"/(checkout|payment|pay|purchase|order|buy|confirm)", re.IGNORECASE),
    re.compile(r"/(admin|settings/delete|account/close)", re.IGNORECASE),
    re.compile(r"\?(.*&)?(amount|price|total)=", re.IGNORECASE),
]

# Prompt-injection keywords in page text that should trigger a flag
INJECTION_PATTERNS = [
    re.compile(r"ignore (previous|all) (instructions?|rules?)", re.IGNORECASE),
    re.compile(r"(act as|pretend to be|you are now) (?!pilot)", re.IGNORECASE),
    re.compile(r"(send|email|post|upload|exfiltrate).*secret", re.IGNORECASE),
    re.compile(r"reveal.*api.?key", re.IGNORECASE),
    re.compile(r"system prompt", re.IGNORECASE),
]

# Operations that always need approval when a financial URL is detected
FINANCIAL_OPS = frozenset({"CLICK", "TYPE", "SELECT"})


class PolicyVerdict(StrEnum):
    ALLOW = "allow"
    REQUIRE_APPROVAL = "require_approval"
    BLOCK = "block"


@dataclass
class PolicyContext:
    url: str
    page_text: str
    operation: str
    element_label: str = ""
    element_index: int | None = None
    run_id: str = ""
    step_index: int = 0


@dataclass
class PolicyResult:
    verdict: PolicyVerdict
    reason: str
    risk: str = "LOW"  # LOW | MEDIUM | HIGH | CRITICAL
    approval_id: str = field(default_factory=lambda: str(uuid.uuid4())[:16])
    title: str = ""
    summary: str = ""


def _is_financial_url(url: str) -> bool:
    from urllib.parse import urlparse
    try:
        hostname = urlparse(url).hostname or ""
        hostname = hostname.lower().removeprefix("www.")
        if hostname in PAYMENT_DOMAINS:
            return True
        for pattern in HIGH_RISK_URL_PATTERNS:
            if pattern.search(url):
                return True
    except Exception:
        pass
    return False


def _detect_injection(page_text: str) -> str | None:
    """Return the injection pattern that was detected, or None."""
    for pattern in INJECTION_PATTERNS:
        m = pattern.search(page_text)
        if m:
            return m.group(0)
    return None


def evaluate(ctx: PolicyContext) -> PolicyResult:
    """
    Evaluate the policy for a proposed action.
    Returns a PolicyResult with verdict, risk, and approval details.
    """
    url = ctx.url
    op = ctx.operation.upper()
    page_text = ctx.page_text

    # Rule 1: Prompt injection detection
    injection = _detect_injection(page_text)
    if injection:
        logger.warning("Policy BLOCK (injection detected) run=%s step=%d pattern=%r", ctx.run_id, ctx.step_index, injection)
        return PolicyResult(
            verdict=PolicyVerdict.BLOCK,
            reason=f"Prompt-injection pattern detected: {injection!r}",
            risk="CRITICAL",
            title="Potential prompt injection blocked",
            summary="The page contains text that appears to try to override the agent's instructions. The action has been blocked.",
        )

    # Rule 2: Financial/payment URL + interactive action → require approval
    if op in FINANCIAL_OPS and _is_financial_url(url):
        logger.info("Policy REQUIRE_APPROVAL (financial URL) run=%s step=%d", ctx.run_id, ctx.step_index)
        return PolicyResult(
            verdict=PolicyVerdict.REQUIRE_APPROVAL,
            reason="Financial or payment page detected",
            risk="HIGH",
            title="Payment action detected",
            summary=f"Pilot is about to interact with a payment page ({url[:80]}). Review and approve to continue.",
        )

    # Rule 3: Checkout/confirm patterns in URL
    for pattern in HIGH_RISK_URL_PATTERNS:
        if pattern.search(url):
            logger.info("Policy REQUIRE_APPROVAL (high-risk URL pattern) run=%s step=%d", ctx.run_id, ctx.step_index)
            return PolicyResult(
                verdict=PolicyVerdict.REQUIRE_APPROVAL,
                reason=f"High-risk URL pattern matched: {pattern.pattern}",
                risk="HIGH",
                title="Action requires confirmation",
                summary="The current page looks like a checkout or confirmation page. Approve to continue.",
            )

    # Rule 4: Suspicious element labels (delete, cancel subscription, etc.)
    label_lower = ctx.element_label.lower()
    destructive_keywords = ["delete", "remove", "cancel subscription", "close account", "unsubscribe", "terminate"]
    if any(kw in label_lower for kw in destructive_keywords):
        logger.info("Policy REQUIRE_APPROVAL (destructive element) run=%s step=%d label=%r", ctx.run_id, ctx.step_index, ctx.element_label)
        return PolicyResult(
            verdict=PolicyVerdict.REQUIRE_APPROVAL,
            reason=f"Potentially destructive element label: {ctx.element_label!r}",
            risk="MEDIUM",
            title="Destructive action detected",
            summary=f"Pilot is about to click '{ctx.element_label}'. This may be irreversible — please confirm.",
        )

    # All clear
    return PolicyResult(
        verdict=PolicyVerdict.ALLOW,
        reason="All policy rules passed",
        risk="LOW",
        title="",
        summary="",
    )
