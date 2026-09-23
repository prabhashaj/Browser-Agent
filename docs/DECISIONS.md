# Architecture Decisions

This document tracks major design decisions for Pilot.

## 1. Decoupled Frontend and Backend

We abandoned the single-tier Next.js/React approach in favor of a clean FastAPI backend and Vite/React frontend.

- **Why**: Browser automation (Playwright) and long-running AI loops require heavy async concurrency that doesn't fit well into serverless functions or Next.js API routes. Python also provides a vastly superior ecosystem for AI (LangChain, instructor, standard SDKs).

## 2. WebSocket for Agent Lifecycle

Instead of polling REST endpoints, the entire agent lifecycle (streaming text, sending frames, asking for approval) runs over a single WebSocket connection per run.

- **Why**: Near zero latency for frames and text streaming. Enables true bi-directional push (e.g. server suddenly asks for an OTP secret).

## 3. JPEG Screencast over CDP

We use Playwright's CDP session to capture JPEG screenshots natively and stream them over WebSockets, rather than attempting DOM-mirroring.

- **Why**: DOM mirroring (sending HTML/CSS over the wire) is brittle, leaks secrets easily, and fails on complex canvases/WebGL. A JPEG stream is 100% accurate to what the agent sees and guarantees no accidental DOM data leakage to the client.

## 4. Deterministic Safety Gate

The LLM does not enforce its own safety. A deterministic Python gate (`policy.py`) sits between the Decider and the Executor.

- **Why**: LLMs are susceptible to prompt injection. A deterministic gate guarantees that certain domains or button labels will ALWAYS pause for human approval, regardless of how the LLM was manipulated.

## 5. Secret Broker

Secrets are requested from the user just-in-time and kept in memory.

- **Why**: We cannot trust the LLM with passwords. The orchestrator intercepts the `TYPE` action, looks up the secret in the broker, and executes the Playwright command with the secret string. The LLM never sees the string, and the string is explicitly scrubbed from logs and client events.

## 6. Jev Protocol

The decider logic (`decider/base.py`) is decoupled behind a `Protocol`.

- **Why**: Allows us to easily swap the standard `LLMDecider` (which uses Gemini/Anthropic) for the `JevDecider` (a specialized, ultra-fast routing model) in Phase 4 without changing the rest of the orchestration loop.
