"""backend/app/api/ws.py — WebSocket hub: one connection per active run."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.auth import get_current_user_id, validate_ws_ticket
from app.schemas.events import ClientCommand

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)
router = APIRouter()

# run_id → asyncio.Queue of server events (dicts)
RUN_QUEUES: dict[str, asyncio.Queue] = {}
# run_id → asyncio.Queue of client commands
CMD_QUEUES: dict[str, asyncio.Queue] = {}


def get_or_create_queues(run_id: str) -> tuple[asyncio.Queue, asyncio.Queue]:
    if run_id not in RUN_QUEUES:
        RUN_QUEUES[run_id] = asyncio.Queue(maxsize=100)
    if run_id not in CMD_QUEUES:
        CMD_QUEUES[run_id] = asyncio.Queue(maxsize=50)
    return RUN_QUEUES[run_id], CMD_QUEUES[run_id]


def cleanup_queues(run_id: str) -> None:
    RUN_QUEUES.pop(run_id, None)
    CMD_QUEUES.pop(run_id, None)


@router.websocket("/ws/{run_id}")
async def websocket_endpoint(websocket: WebSocket, run_id: str):
    # Auth: cookie or ?ticket= query param
    ticket = websocket.query_params.get("ticket")
    user_id: str | None = None

    if ticket:
        user_id = validate_ws_ticket(ticket)
    else:
        try:
            user_id = get_current_user_id(websocket)
        except Exception:
            pass

    if not user_id:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    event_queue, cmd_queue = get_or_create_queues(run_id)

    async def send_events():
        """Forward server events to the WebSocket client."""
        while True:
            try:
                event = await asyncio.wait_for(event_queue.get(), timeout=30)
                if event is None:  # sentinel: run finished
                    break
                await websocket.send_text(json.dumps(event))
                event_queue.task_done()
            except asyncio.TimeoutError:
                # Send keepalive ping
                try:
                    await websocket.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    break
            except Exception as e:
                logger.debug("WS send error: %s", e)
                break

    async def receive_commands():
        """Receive client commands and enqueue for the agent."""
        while True:
            try:
                raw = await websocket.receive_text()
                data = json.loads(raw)
                cmd_queue.put_nowait(data)
            except WebSocketDisconnect:
                break
            except asyncio.QueueFull:
                logger.warning("Command queue full for run %s, dropping", run_id)
            except Exception as e:
                logger.debug("WS receive error: %s", e)
                break

    # Run both coroutines concurrently
    done, pending = await asyncio.wait(
        [
            asyncio.create_task(send_events()),
            asyncio.create_task(receive_commands()),
        ],
        return_when=asyncio.FIRST_COMPLETED,
    )
    for task in pending:
        task.cancel()

    logger.info("WebSocket closed for run %s (user %s)", run_id, user_id)
