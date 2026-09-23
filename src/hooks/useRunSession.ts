/**
 * src/hooks/useRunSession.ts
 *
 * The single source of truth for an active agent run.
 * Owns the WebSocket, reconnects with backoff, and applies all events
 * through a pure reducer into the zustand store.
 *
 * Exposes: send(), approve(), decline(), provideSecret(), stop(), takeOver(), resume()
 */
import { useCallback, useEffect, useRef } from "react";
import { nanoid } from "nanoid";
import { api } from "@/lib/api";
import { usePilotStore } from "@/store/pilotStore";

const WS_BASE = (import.meta.env["VITE_WS_BASE"] as string | undefined) ?? "ws://localhost:8000";

// Backoff: 1s, 2s, 4s, 8s, 16s, cap 30s
const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000];

export interface RunSessionHandle {
  send: (text: string) => Promise<void>;
  approve: (id: string) => void;
  decline: (id: string) => void;
  provideSecret: (id: string, values: Record<string, string>) => void;
  stop: () => void;
  takeOver: () => void;
  resume: () => void;
}

// Helpers to safely extract typed values from unknown event objects
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const bool = (v: unknown): boolean => (typeof v === "boolean" ? v : false);
const optStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const optNum = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

export function useRunSession(threadId: string): RunSessionHandle {
  const store = usePilotStore();
  const wsRef = useRef<WebSocket | null>(null);
  const runIdRef = useRef<string | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);

  const sendWsCmd = useCallback((cmd: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd));
    }
  }, []);

  const applyEvent = useCallback((raw: Record<string, unknown>) => {
    const s = usePilotStore.getState();
    const type = str(raw["type"]);

    switch (type) {
      case "message_delta":
        s.appendAssistantDelta(str(raw["delta"]));
        if (s.agentStatus === "thinking") s.setAgentStatus("running");
        break;

      case "message_done":
        s.setAgentStatus("idle");
        s.finalizeAssistantMessage();
        break;

      case "task_started":
        s.setTask({
          id: runIdRef.current ?? nanoid(),
          title: str(raw["title"]),
          status: "planning",
          progress: 4,
          startedAt: Date.now(),
          currentAction: "Planning a safe route",
        });
        s.setAgentStatus("running");
        if (s.layoutMode === "chat") s.setLayoutMode("split");
        break;

      case "plan":
        s.setSteps(
          arr(raw["steps"]).map((st) => {
            const step = obj(st);
            return {
              id: str(step["id"]),
              index: num(step["index"]),
              operation: str(step["operation"]),
              target: str(step["target"]),
              ...(step["element_index"] != null ? { elementIndex: num(step["element_index"]) } : {}),
              status: "pending" as const,
            };
          })
        );
        break;

      case "step_started":
        s.updateStep(str(raw["step_id"]), { status: "running" });
        s.updateTask({ currentAction: str(raw["action"]), status: "running" });
        break;

      case "step_finished":
        s.updateStep(str(raw["step_id"]), { status: "done" });
        {
          const done = usePilotStore.getState().steps.filter((x) => x.status === "done").length;
          const total = Math.max(usePilotStore.getState().steps.length, 1);
          s.updateTask({ progress: Math.round((done / total) * 100) });
        }
        break;

      case "step_failed":
        s.updateStep(str(raw["step_id"]), { status: "blocked" });
        break;

      case "tabs_updated":
        s.setTabs(
          arr(raw["tabs"]).map((t) => {
            const tab = obj(t);
            return {
              id: str(tab["id"]),
              title: str(tab["title"]),
              url: str(tab["url"]),
              loading: bool(tab["loading"]),
              active: bool(tab["active"]),
            };
          })
        );
        break;

      case "frame":
        s.setLastFrame(str(raw["data"]), {
          w: num(obj(raw["viewport"])["w"]),
          h: num(obj(raw["viewport"])["h"]),
        });
        break;

      case "element_table":
        s.setElementTable(
          arr(raw["elements"]).map((el) => {
            const e = obj(el);
            const bboxRaw = obj(e["bbox"]);
            return {
              index: num(e["index"]),
              type: str(e["kind"]) as "button" | "textbox" | "combobox" | "link",
              label: str(e["label"]),
              ...(e["value"] != null ? { value: str(e["value"]) } : {}),
              bbox: { x: num(bboxRaw["x"]), y: num(bboxRaw["y"]), w: num(bboxRaw["w"]), h: num(bboxRaw["h"]) },
            };
          })
        );
        break;

      case "action_chosen":
        if (raw["bbox"]) {
          const bbox = obj(raw["bbox"]);
          const cursorPayload: Parameters<typeof s.setCursor>[0] = {
            x: num(bbox["x"]) * 100,
            y: num(bbox["y"]) * 100,
            ...(raw["element_index"] != null ? { elementIndex: num(raw["element_index"]) } : {}),
          };
          s.setCursor(cursorPayload);
        }
        break;

      case "approval_required":
        s.setApproval({
          id: str(raw["approval_id"]),
          title: str(raw["title"]),
          summary: str(raw["summary"]),
          ...(raw["amount"] != null ? { amount: str(raw["amount"]) } : {}),
          ...(raw["risk"] != null ? { risk: str(raw["risk"]) } : {}),
          ...(raw["screenshot"] != null ? { screenshot: str(raw["screenshot"]) } : {}),
          ...(raw["timeout_seconds"] != null ? { timeoutSeconds: num(raw["timeout_seconds"]) } : {}),
        });
        s.setAgentStatus("waiting");
        break;

      case "secret_required":
        s.setSecret({
          id: str(raw["secret_id"]),
          title: str(raw["title"]),
          fields: arr(raw["fields"]).map((f) => {
            const field = obj(f);
            return { key: str(field["key"]), label: str(field["label"]), kind: str(field["kind"]) };
          }),
        });
        s.setAgentStatus("waiting");
        break;

      case "blocked":
        s.setAgentStatus("failed");
        s.addServerMessage({ id: nanoid(), role: "assistant", text: `⚠️ Blocked: ${str(raw["reason"])}`, createdAt: Date.now() });
        break;

      case "task_finished": {
        const result = obj(raw["result"]);
        s.updateTask({ status: "done", progress: 100 });
        s.setAgentStatus("idle");
        s.addServerMessage({
          id: nanoid(),
          role: "assistant",
          text: str(result["message"]),
          createdAt: Date.now(),
          resultJson: JSON.stringify(result),
        });
        break;
      }

      case "task_failed":
        s.updateTask({ status: "failed" });
        s.setAgentStatus("idle");
        s.addServerMessage({ id: nanoid(), role: "assistant", text: str(raw["message"]), createdAt: Date.now() });
        break;

      case "reconnect_snapshot":
        if (raw["steps"]) {
          s.setSteps(arr(raw["steps"]).map((st) => {
            const step = obj(st);
            return {
              id: str(step["id"]),
              index: num(step["index"]),
              operation: str(step["operation"]),
              target: str(step["target"]),
              ...(step["element_index"] != null ? { elementIndex: num(step["element_index"]) } : {}),
              status: str(step["status"]) as "pending" | "running" | "done" | "blocked",
            };
          }));
        }
        if (raw["tabs"]) {
          s.setTabs(arr(raw["tabs"]).map((t) => {
            const tab = obj(t);
            return { id: str(tab["id"]), title: str(tab["title"]), url: str(tab["url"]), loading: bool(tab["loading"]), active: bool(tab["active"]) };
          }));
        }
        s.setReconnecting(false);
        break;
    }
  }, []);

  const connectWs = useCallback(async (runId: string) => {
    if (stopped.current) return;

    let ticketParam = "";
    try {
      const { ticket } = await api.auth.wsTicket();
      ticketParam = `?ticket=${ticket}`;
    } catch {
      // Fall back to cookie auth
    }

    const url = `${WS_BASE}/ws/${runId}${ticketParam}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempts.current = 0;
      usePilotStore.getState().setReconnecting(false);
    };

    ws.onmessage = (e: MessageEvent<string>) => {
      try {
        const event = JSON.parse(e.data) as Record<string, unknown>;
        if (event["type"] === "ping") return;
        applyEvent(event);
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = (e: CloseEvent) => {
      if (stopped.current || e.code === 1000) return;
      const delay = BACKOFF[Math.min(reconnectAttempts.current, BACKOFF.length - 1)] ?? 30000;
      reconnectAttempts.current++;
      usePilotStore.getState().setReconnecting(true);
      reconnectTimer.current = setTimeout(() => {
        const rid = runIdRef.current;
        if (rid) void connectWs(rid);
      }, delay);
    };
  }, [applyEvent]);

  // Public API ─────────────────────────────────────────────────────────────────

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const s = usePilotStore.getState();
    const userMsgId = nanoid();
    s.addServerMessage({ id: userMsgId, role: "user", text: trimmed, createdAt: Date.now() });
    const assistantId = nanoid();
    s.addServerMessage({ id: assistantId, role: "assistant", text: "", createdAt: Date.now() });
    s.setCurrentAssistantId(assistantId);
    s.setAgentStatus("thinking");

    try {
      const run = await api.runs.create(threadId, trimmed);
      runIdRef.current = run.id;
      s.setCurrentRunId(run.id);
      stopped.current = false;
      await connectWs(run.id);
    } catch (err) {
      s.setAgentStatus("idle");
      s.addServerMessage({ id: nanoid(), role: "assistant", text: `Error: ${(err as Error).message}`, createdAt: Date.now() });
    }
  }, [threadId, connectWs]);

  const approve = useCallback((id: string) => {
    sendWsCmd({ cmd: "approve", approval_id: id });
    usePilotStore.getState().setApproval(null);
  }, [sendWsCmd]);

  const decline = useCallback((id: string) => {
    sendWsCmd({ cmd: "decline", approval_id: id });
    usePilotStore.getState().setApproval(null);
  }, [sendWsCmd]);

  const provideSecret = useCallback((id: string, values: Record<string, string>) => {
    sendWsCmd({ cmd: "provide_secret", secret_id: id, values });
    usePilotStore.getState().setSecret(null);
  }, [sendWsCmd]);

  const stop = useCallback(() => {
    stopped.current = true;
    sendWsCmd({ cmd: "stop" });
    wsRef.current?.close(1000, "user stopped");
    usePilotStore.getState().setAgentStatus("idle");
  }, [sendWsCmd]);

  const takeOver = useCallback(() => {
    sendWsCmd({ cmd: "takeover_start" });
    usePilotStore.getState().setControlOwner("user");
  }, [sendWsCmd]);

  const resume = useCallback(() => {
    sendWsCmd({ cmd: "resume" });
    usePilotStore.getState().setControlOwner("agent");
  }, [sendWsCmd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopped.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close(1000, "unmount");
    };
  }, []);

  return { send, approve, decline, provideSecret, stop, takeOver, resume };
}
