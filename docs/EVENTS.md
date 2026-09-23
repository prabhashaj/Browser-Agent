# Pilot WebSocket Event Contract

All server→client events arrive as JSON objects over a WebSocket connection at:

```
ws://localhost:8000/ws/{run_id}?ticket={ws_ticket}
```

Every event includes these base fields:

| Field    | Type     | Description                              |
| -------- | -------- | ---------------------------------------- |
| `type`   | `string` | Discriminator (see below)                |
| `run_id` | `string` | UUID of the current run                  |
| `seq`    | `number` | Monotonically increasing sequence number |
| `ts`     | `string` | ISO-8601 UTC timestamp                   |

---

## Events Reference

### Chat

#### `message_delta`

Streamed text chunk from the LLM (chat mode).

```json
{ "type": "message_delta", "delta": "Hello! I can help with..." }
```

#### `message_done`

Signals the current streaming reply is complete.

```json
{ "type": "message_done" }
```

---

### Browser Task Lifecycle

#### `task_started`

A browser task has begun.

```json
{
  "type": "task_started",
  "goal": "Book a flight from JFK to Dubai",
  "title": "Book a flight from JFK to Dubai"
}
```

#### `task_finished`

Task completed successfully.

```json
{
  "type": "task_finished",
  "result": {
    "kind": "flight|food|products|generic",
    "data": { ... },
    "sources": ["https://..."],
    "message": "I found a flight for $842.",
    "screenshot": "<base64-jpeg>"
  }
}
```

#### `task_failed`

Task stopped with an error.

```json
{ "type": "task_failed", "message": "Agent stopped after 60 steps." }
```

---

### Browser Screencast

#### `frame`

A live JPEG frame from the agent's browser.

```json
{
  "type": "frame",
  "tab_id": "abc123",
  "mime": "image/jpeg",
  "data": "<base64>",
  "viewport": { "w": 1280, "h": 800 }
}
```

#### `tabs_updated`

Tab list updated (navigation, new tab, close).

```json
{
  "type": "tabs_updated",
  "tabs": [
    {
      "id": "abc123",
      "title": "Google",
      "url": "https://google.com",
      "loading": false,
      "active": true
    }
  ]
}
```

---

### Agent Steps

#### `step_started`

An agent step has begun executing.

```json
{ "type": "step_started", "step_id": "step-3", "action": "Clicking search button" }
```

#### `step_finished`

An agent step completed successfully.

```json
{ "type": "step_finished", "step_id": "step-3", "duration_ms": 850 }
```

#### `step_failed`

An agent step failed.

```json
{ "type": "step_failed", "step_id": "step-3", "reason": "Element not found" }
```

#### `action_chosen`

The LLM chose an action (before policy gate / execution).

```json
{
  "type": "action_chosen",
  "step_id": "step-3",
  "operation": "CLICK",
  "element_index": 2,
  "text": null,
  "bbox": { "x": 0.1, "y": 0.05, "w": 0.08, "h": 0.04 }
}
```

> ⚠️ **`text` is always `null`** — never sent to the client. TYPE actions may contain secrets.

#### `element_table`

Current page's interactive element snapshot.

```json
{
  "type": "element_table",
  "step_id": "obs-3",
  "elements": [
    {
      "index": 1,
      "kind": "textbox",
      "label": "Search",
      "value": "",
      "disabled": false,
      "bbox": { "x": 0.1, "y": 0.05, "w": 0.6, "h": 0.04 }
    }
  ]
}
```

---

### Safety

#### `approval_required`

The policy gate requires explicit human approval before continuing.

```json
{
  "type": "approval_required",
  "approval_id": "abc-xyz-123",
  "title": "Payment action detected",
  "summary": "Pilot is about to interact with a payment page...",
  "risk": "HIGH",
  "screenshot": "<base64-jpeg>",
  "timeout_seconds": 300
}
```

**Client response (cmd):**

```json
{ "cmd": "approve", "approval_id": "abc-xyz-123" }
```

or

```json
{ "cmd": "decline", "approval_id": "abc-xyz-123" }
```

#### `blocked`

A CRITICAL policy rule was violated — run stops.

```json
{ "type": "blocked", "reason": "Prompt-injection pattern detected", "options": ["cancel"] }
```

#### `secret_required`

The agent detected a sensitive input field and needs the user to provide the value.

```json
{
  "type": "secret_required",
  "secret_id": "xyz-123",
  "title": "Secret needed: Password",
  "fields": [{ "key": "value", "label": "Password", "kind": "password" }]
}
```

**Client response (cmd):**

```json
{ "cmd": "provide_secret", "secret_id": "xyz-123", "values": { "value": "..." } }
```

---

## Client→Server Commands

All commands are JSON sent over the same WebSocket:

| Command          | Fields                | Description                       |
| ---------------- | --------------------- | --------------------------------- |
| `stop`           | —                     | Immediately stops the current run |
| `approve`        | `approval_id`         | Approves a pending policy gate    |
| `decline`        | `approval_id`         | Declines a pending policy gate    |
| `provide_secret` | `secret_id`, `values` | Provides secret field values      |
| `resume`         | —                     | Resumes after a BLOCKED event     |
