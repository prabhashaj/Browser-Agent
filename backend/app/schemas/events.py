"""
backend/app/schemas/events.py
==============================
Single source of truth for the WebSocket event contract between the
FastAPI backend and the React frontend.

All server→client events include `run_id`, `seq`, and `ts` (ISO-8601).
TypeScript types are auto-generated from this file via:
    python -m app.schemas.events --export-json > schemas/events.json
    bun run gen:types
"""
from __future__ import annotations

import json
import sys
from enum import StrEnum
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


# ── Primitive enums ────────────────────────────────────────────────────────────

class Operation(StrEnum):
    CLICK = "CLICK"
    TYPE = "TYPE"
    SELECT = "SELECT"
    SCROLL_UP = "SCROLL_UP"
    SCROLL_DOWN = "SCROLL_DOWN"
    WAIT = "WAIT"
    NAVIGATE = "NAVIGATE"
    BACK = "BACK"
    DONE = "DONE"
    BLOCKED = "BLOCKED"


class ElementKind(StrEnum):
    button = "button"
    textbox = "textbox"
    combobox = "combobox"
    link = "link"
    checkbox = "checkbox"
    radio = "radio"
    select = "select"
    other = "other"


class RiskLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class RunStatus(StrEnum):
    pending = "pending"
    running = "running"
    waiting = "waiting"
    done = "done"
    failed = "failed"
    cancelled = "cancelled"


# ── Shared primitives ──────────────────────────────────────────────────────────

class EventBase(BaseModel):
    """All server→client events extend this."""
    run_id: str
    seq: int
    ts: str  # ISO-8601 UTC


class Viewport(BaseModel):
    w: int
    h: int


class BBox(BaseModel):
    """Normalized bounding box (0–1 fraction of viewport)."""
    x: float
    y: float
    w: float
    h: float


class Element(BaseModel):
    index: int
    kind: ElementKind
    label: str
    value: str | None = None
    disabled: bool = False
    bbox: BBox


class BrowserTab(BaseModel):
    id: str
    title: str
    url: str
    loading: bool = False
    active: bool = False


class AgentStep(BaseModel):
    id: str
    index: int
    operation: Operation
    target: str
    element_index: int | None = None
    status: Literal["pending", "running", "done", "blocked"] = "pending"
    started_at: str | None = None
    finished_at: str | None = None
    duration_ms: int | None = None


class SecretField(BaseModel):
    key: str
    label: str
    kind: Literal["text", "password", "card_number", "card_expiry", "card_cvv"]


class RunResult(BaseModel):
    kind: str  # "flight" | "food" | "products" | "generic"
    data: dict  # structured result data
    sources: list[str] = Field(default_factory=list)
    message: str
    screenshot: str | None = None  # base64-encoded final screenshot


# ── Server → Client events ─────────────────────────────────────────────────────

class MessageDeltaEvent(EventBase):
    type: Literal["message_delta"] = "message_delta"
    delta: str


class MessageDoneEvent(EventBase):
    type: Literal["message_done"] = "message_done"


class TaskStartedEvent(EventBase):
    type: Literal["task_started"] = "task_started"
    goal: str
    title: str


class PlanEvent(EventBase):
    type: Literal["plan"] = "plan"
    steps: list[AgentStep]


class StepStartedEvent(EventBase):
    type: Literal["step_started"] = "step_started"
    step_id: str
    action: str


class StepFinishedEvent(EventBase):
    type: Literal["step_finished"] = "step_finished"
    step_id: str
    duration_ms: int


class StepFailedEvent(EventBase):
    type: Literal["step_failed"] = "step_failed"
    step_id: str
    reason: str


class TabsUpdatedEvent(EventBase):
    """Replaces the old browser_navigate / browser_frame hack."""
    type: Literal["tabs_updated"] = "tabs_updated"
    tabs: list[BrowserTab]


class FrameEvent(EventBase):
    """CDP screencast frame. `data` is base64-encoded JPEG."""
    type: Literal["frame"] = "frame"
    tab_id: str
    mime: Literal["image/jpeg"] = "image/jpeg"
    data: str  # base64
    viewport: Viewport


class ElementTableEvent(EventBase):
    type: Literal["element_table"] = "element_table"
    step_id: str
    elements: list[Element]


class ActionChosenEvent(EventBase):
    """
    Emitted right before executor fires an action.
    bbox is the bounding box of the target element (normalized coords).
    """
    type: Literal["action_chosen"] = "action_chosen"
    step_id: str
    operation: Operation
    element_index: int | None = None
    text: str | None = None
    bbox: BBox | None = None


class ApprovalRequiredEvent(EventBase):
    type: Literal["approval_required"] = "approval_required"
    approval_id: str
    title: str
    summary: str
    amount: str | None = None
    risk: RiskLevel
    screenshot: str | None = None  # base64 crop of the element
    element_index: int | None = None
    timeout_seconds: int = 300


class SecretRequiredEvent(EventBase):
    type: Literal["secret_required"] = "secret_required"
    secret_id: str
    title: str
    fields: list[SecretField]


class BlockedEvent(EventBase):
    type: Literal["blocked"] = "blocked"
    reason: str
    options: list[Literal["takeover", "retry", "cancel"]]


class TaskFinishedEvent(EventBase):
    type: Literal["task_finished"] = "task_finished"
    result: RunResult


class TaskFailedEvent(EventBase):
    type: Literal["task_failed"] = "task_failed"
    message: str


class ReconnectSnapshotEvent(EventBase):
    """Sent immediately after a client reconnects to a running session."""
    type: Literal["reconnect_snapshot"] = "reconnect_snapshot"
    status: RunStatus
    steps: list[AgentStep]
    pending_approval: ApprovalRequiredEvent | None = None
    pending_secret: SecretRequiredEvent | None = None
    tabs: list[BrowserTab]
    last_frame: str | None = None  # base64 JPEG of last captured frame


# ── Discriminated union ────────────────────────────────────────────────────────

ServerEvent = Annotated[
    Union[
        MessageDeltaEvent,
        MessageDoneEvent,
        TaskStartedEvent,
        PlanEvent,
        StepStartedEvent,
        StepFinishedEvent,
        StepFailedEvent,
        TabsUpdatedEvent,
        FrameEvent,
        ElementTableEvent,
        ActionChosenEvent,
        ApprovalRequiredEvent,
        SecretRequiredEvent,
        BlockedEvent,
        TaskFinishedEvent,
        TaskFailedEvent,
        ReconnectSnapshotEvent,
    ],
    Field(discriminator="type"),
]


# ── Client → Server commands ───────────────────────────────────────────────────

class UserMessageCmd(BaseModel):
    cmd: Literal["user_message"] = "user_message"
    text: str


class StopCmd(BaseModel):
    cmd: Literal["stop"] = "stop"


class ApproveCmd(BaseModel):
    cmd: Literal["approve"] = "approve"
    approval_id: str


class DeclineCmd(BaseModel):
    cmd: Literal["decline"] = "decline"
    approval_id: str


class ProvideSecretCmd(BaseModel):
    cmd: Literal["provide_secret"] = "provide_secret"
    secret_id: str
    values: dict[str, str]  # key → plaintext value (TLS only; never logged)


class TakeoverStartCmd(BaseModel):
    cmd: Literal["takeover_start"] = "takeover_start"


class TakeoverInputCmd(BaseModel):
    cmd: Literal["takeover_input"] = "takeover_input"
    kind: Literal["click", "move", "key", "type", "scroll"]
    # Normalized coords (0–1), only for click/move/scroll
    x: float | None = None
    y: float | None = None
    # Key name for "key" events
    key: str | None = None
    # Text for "type" events
    text: str | None = None
    # Scroll delta
    delta_x: float | None = None
    delta_y: float | None = None


class ResumeCmd(BaseModel):
    cmd: Literal["resume"] = "resume"


ClientCommand = Annotated[
    Union[
        UserMessageCmd,
        StopCmd,
        ApproveCmd,
        DeclineCmd,
        ProvideSecretCmd,
        TakeoverStartCmd,
        TakeoverInputCmd,
        ResumeCmd,
    ],
    Field(discriminator="cmd"),
]


# ── JSON Schema export ─────────────────────────────────────────────────────────

def export_json_schema() -> dict:
    """Export the full schema for TypeScript generation."""
    from pydantic import TypeAdapter
    server_adapter = TypeAdapter(ServerEvent)
    client_adapter = TypeAdapter(ClientCommand)
    return {
        "server": server_adapter.json_schema(),
        "client": client_adapter.json_schema(),
        "$defs": {
            **server_adapter.json_schema().get("$defs", {}),
            **client_adapter.json_schema().get("$defs", {}),
        },
    }


if __name__ == "__main__":
    # Run as: python -m app.schemas.events --export-json
    if "--export-json" in sys.argv:
        print(json.dumps(export_json_schema(), indent=2))
