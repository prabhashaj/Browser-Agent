# Pilot Safety Model

Pilot operates an autonomous browser. To prevent harm, every action proposed by the LLM passes through a **deterministic policy gate** before reaching the browser.

## Architecture

```
┌───────┐     ┌──────────┐     ┌───────────┐     ┌─────────────┐
│ LLM   │ ──► │ Policy   │ ──► │ Secret    │ ──► │ Browser     │
│ Agent │     │ Gate     │     │ Broker    │     │ Execution   │
└───────┘     └──────────┘     └───────────┘     └─────────────┘
                   │                 │
             [Block/Ask]        [Inject]
```

1. **Agent Output**: The LLM outputs a JSON action (e.g., `{"operation": "CLICK", "element_index": 2}`).
2. **Policy Gate**: The `policy.py` module evaluates the action in context (URL, page text, element label).
3. **Secret Broker**: If the target element is a known secret field (e.g., password), the exact text is injected _at execution time_.
4. **Execution**: Playwright executes the approved, hydrated action.

## Policy Rules

The policy gate returns one of three verdicts:

- `ALLOW`: Low-risk action, execute immediately.
- `REQUIRE_APPROVAL`: High-risk action, pause and wait for user approval via WebSocket.
- `BLOCK`: Critical risk, immediately abort the run.

### Current Heuristics

| Trigger                                                                              | Verdict              | Risk     | Rationale                                          |
| ------------------------------------------------------------------------------------ | -------------------- | -------- | -------------------------------------------------- |
| Page contains prompt injection strings (e.g., "Ignore previous instructions")        | **BLOCK**            | CRITICAL | Prevents malicious sites from hijacking the agent. |
| URL domain relates to banking, crypto, or payments (e.g., `paypal.com`, `chase.com`) | **REQUIRE_APPROVAL** | HIGH     | Financial safety.                                  |
| URL path contains checkout or confirmation steps                                     | **REQUIRE_APPROVAL** | HIGH     | Prevents unintended purchases.                     |
| Element label indicates a destructive action (e.g., "Delete", "Cancel subscription") | **REQUIRE_APPROVAL** | MEDIUM   | Prevents data loss.                                |

## Secrets Management

Secrets (passwords, 2FA tokens, credit card numbers) are handled with extreme care:

- **Never sent to the LLM**: The LLM instructs the agent to TYPE into the password field without knowing the password.
- **Never logged**: The `TYPE` action payload in logs masks the actual string.
- **Never sent over WebSocket**: The `action_chosen` event sent to the client replaces the `text` field with `null`.
- **Ephemeral Storage**: Secrets are requested via a `secret_required` event and held in memory only for the duration of the run.

## Server-Side Request Forgery (SSRF) Protection

Pilot's headless browser operates inside your infrastructure. To prevent it from accessing internal services, we apply a strict block-list at the browser routing level (`profiles.py`):

- Blocks private IPs (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Blocks localhost/loopback (127.0.0.0/8, ::1)
- Blocks link-local (169.254.0.0/16)
- Blocks dangerous protocols (`file://`, `chrome://`, `data://`)

The only exception is `localhost` if the `ALLOW_LOCAL_NETWORK` env var is explicitly set to `true` (for testing demo sites).
