/**
 * src/types/pilot.ts
 *
 * Core UI types. Keep this file for UI-specific types only.
 * Server event types are auto-generated from backend/app/schemas/events.py
 * and will live in src/types/generated/events.ts (Phase 0 gen step).
 */

export type LayoutMode = "chat" | "split";
export type Theme = "dark" | "light";
export type AgentStatus = "idle" | "thinking" | "running" | "waiting" | "done" | "failed";
export type VoiceState = "idle" | "listening" | "thinking" | "speaking";
export type TaskStatus = "planning" | "running" | "waiting" | "done" | "failed";
export type Operation =
  | "CLICK"
  | "TYPE"
  | "SELECT"
  | "SCROLL_UP"
  | "SCROLL_DOWN"
  | "WAIT"
  | "NAVIGATE"
  | "BACK"
  | "DONE"
  | "BLOCKED";

// Still used by MockPages/demo mode
export type PageKind = "search" | "flights" | "food" | "shopping" | "checkout" | "complete";
export type ResultKind = "flight" | "food" | "products" | "generic";

export interface AgentStep {
  id: string;
  index: number;
  operation: string;
  target: string;
  elementIndex?: number;
  status: "pending" | "running" | "done" | "blocked";
}

export interface AgentTask {
  id: string;
  title: string;
  status: TaskStatus;
  progress: number;
  startedAt: number;
  currentAction: string;
  /** Still used by TaskCard for icon selection (real tasks set to "generic") */
  scenario?: ResultKind;
}

/** Structured result from summarizer — matches RunResult in events.py */
export interface RunResult {
  kind: ResultKind;
  data: Record<string, unknown>;
  sources: string[];
  message: string;
  screenshot?: string; // base64
}