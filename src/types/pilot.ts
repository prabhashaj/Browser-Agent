export type LayoutMode = "chat" | "split";
export type Theme = "dark" | "light";
export type AgentStatus = "idle" | "thinking" | "running" | "waiting" | "done" | "failed";
export type VoiceState = "idle" | "listening" | "thinking" | "speaking";
export type TaskStatus = "planning" | "running" | "waiting" | "done" | "failed";
export type Operation = "CLICK" | "TYPE" | "SELECT" | "SCROLL_UP" | "SCROLL_DOWN" | "WAIT" | "DONE" | "BLOCKED";
export type PageKind = "search" | "flights" | "food" | "shopping" | "checkout" | "complete";
export type ResultKind = "flight" | "food" | "products";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  result?: ResultKind;
}

export interface ChatThread {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  page: PageKind;
  loading?: boolean;
}

export interface AgentStep {
  id: string;
  index: number;
  operation: Operation;
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
  scenario: ResultKind;
  currentAction: string;
}

export interface ApprovalRequest {
  id: string;
  title: string;
  summary: string;
  amount?: string;
}

export interface SecretRequest {
  id: string;
  title: string;
  fields: string[];
}

export interface PageElement {
  index: number;
  type: "button" | "textbox" | "combobox" | "link";
  label: string;
  value?: string;
}

export type AgentEvent =
  | { type: "message_delta"; delta: string }
  | { type: "message_done" }
  | { type: "task_started"; task: AgentTask }
  | { type: "plan"; steps: AgentStep[] }
  | { type: "step_started"; stepId: string; action: string }
  | { type: "step_finished"; stepId: string }
  | { type: "browser_navigate"; tab: BrowserTab }
  | { type: "browser_frame"; page: PageKind }
  | { type: "cursor_move"; x: number; y: number }
  | { type: "element_highlight"; index: number }
  | { type: "approval_required"; request: ApprovalRequest }
  | { type: "secret_required"; request: SecretRequest }
  | { type: "task_finished"; result: ResultKind; message: string }
  | { type: "task_failed"; message: string };

export interface AgentService {
  sendMessage(text: string): AsyncGenerator<AgentEvent>;
  startVoice(): Promise<void>;
  stop(): void;
  approve(id: string): void;
  provideSecret(id: string): void;
  takeOver(): void;
  resume(): void;
}

export interface BrowserFrame {
  type: "component" | "image";
  page?: PageKind;
  src?: string;
}