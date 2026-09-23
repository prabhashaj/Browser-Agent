# Pilot — AI Browser Agent

> Chat with an AI that can browse the real web on your behalf. Every action requiring real-world consequences needs your explicit approval.

[![CI](https://github.com/prabhashaj/Browser-Agent/actions/workflows/ci.yml/badge.svg)](https://github.com/prabhashaj/Browser-Agent/actions)

---

## Architecture

```
┌──────────────────────────┐      HTTP REST       ┌────────────────────────────┐
│   React + TanStack Start  │ ◄──────────────────► │        FastAPI              │
│   (Vite, Zustand, Framer) │      WebSocket        │  (uvicorn, SQLAlchemy)     │
│   localhost:8080          │ ◄──────────────────► │  localhost:8000            │
└──────────────────────────┘                       └──────────────┬─────────────┘
                                                                  │
                                              ┌───────────────────▼──────────────┐
                                              │      Agent Loop (background)      │
                                              │  Route → Observe → Decide →       │
                                              │  Policy → Execute → Verify        │
                                              └───────────────────┬──────────────┘
                                                                  │
                                              ┌───────────────────▼──────────────┐
                                              │   Playwright (headless Chromium)  │
                                              │   CDP Screencast → JPEG frames    │
                                              └──────────────────────────────────┘
```

## Quick Start

### Prerequisites
- **Node.js / Bun** (for frontend): `bun >= 1.x`
- **Python 3.12** (for backend)
- **Playwright**: installed automatically with `playwright install chromium`

### 1. Clone and install

```bash
git clone https://github.com/prabhashaj/Browser-Agent.git
cd Browser-Agent
bun install
pip install -r backend/requirements.txt
playwright install chromium
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and set at minimum ONE of:
#   GEMINI_API_KEY=your-key
#   ANTHROPIC_API_KEY=your-key
```

### 3. Run

Open two terminals:

```bash
# Terminal 1 — Backend
cd backend
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
bun run dev
```

Open **http://localhost:8080** — sign up for a local account and start chatting.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | — | Google Gemini API key (preferred) |
| `ANTHROPIC_API_KEY` | — | Anthropic Claude API key |
| `DATABASE_URL` | `sqlite+aiosqlite:///./pilot.db` | SQLite (default) or PostgreSQL connection string |
| `SESSION_SECRET` | `change-me-in-production` | **Change this!** Secret for signed session cookies |
| `MAX_CONCURRENT_RUNS` | `2` | Max parallel agent runs per server |
| `MAX_STEPS_PER_RUN` | `60` | Hard limit on LLM steps per run |
| `MAX_RUN_SECONDS` | `600` | Hard time budget per run (10 min) |
| `APPROVAL_TIMEOUT_SECONDS` | `300` | How long the agent waits for human approval |
| `SCREENCAST_FPS` | `10` | JPEG frame rate sent to client |
| `KILL_SWITCH` | `false` | Set `true` to immediately stop all new runs |

---

## Safety Model

Every action proposed by the LLM passes through a **deterministic policy gate** before execution:

| Trigger | Verdict | Risk |
|---|---|---|
| Prompt-injection text in page | BLOCK | CRITICAL |
| Payment/financial domain | REQUIRE\_APPROVAL | HIGH |
| Checkout/confirm URL pattern | REQUIRE\_APPROVAL | HIGH |
| Destructive element label (delete, cancel subscription…) | REQUIRE\_APPROVAL | MEDIUM |
| Everything else | ALLOW | LOW |

The LLM **cannot** override these rules. A `BLOCK` verdict immediately stops the run.

**Secrets** (passwords, card numbers, OTPs) are:
- Never logged
- Never sent in WebSocket events
- Never passed to the LLM
- Encrypted with AES-256-GCM at rest (when `SECRET_ENCRYPTION_KEY` is set)

---

## Docker

```bash
docker compose up --build
```

The compose file starts:
- `backend` — FastAPI on port 8000
- `frontend` — Vite dev server on port 8080 (dev) or nginx (prod)

---

## Project Structure

```
Browser-Agent/
├── backend/
│   ├── app/
│   │   ├── agent/          # orchestrator, router, observer, decider, executor, policy, secrets
│   │   ├── api/            # auth, threads, runs, ws
│   │   ├── browser/        # session_manager, screencast, profiles (SSRF)
│   │   ├── db/             # models, session
│   │   ├── llm/            # provider, gemini, anthropic
│   │   └── schemas/        # events.py (WS contract)
│   └── tests/
│       ├── test_policy.py
│       └── test_ssrf.py
├── src/
│   ├── features/
│   │   ├── chat/           # ChatPanel, Composer, Transcript, TaskCard, ResultCards, ...
│   │   └── browser/        # BrowserPanel (live JPEG viewport)
│   ├── components/         # PilotShell, TopBar, ApprovalSheet, SecretModal, ...
│   ├── hooks/              # useRunSession (WS + reducer)
│   ├── lib/                # api.ts (REST client)
│   ├── routes/             # index, login, signup
│   └── store/              # pilotStore (Zustand)
├── demo-sites/             # Static HTML for local E2E testing
│   ├── flights/
│   └── food/
└── .github/workflows/ci.yml
```

---

## Development

```bash
# Frontend typecheck
bun x tsc --noEmit

# Backend lint
ruff check backend/

# Backend tests
cd backend && pytest -x -q
```
