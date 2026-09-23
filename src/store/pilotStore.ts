/**
 * src/store/pilotStore.ts
 *
 * UI state only — threads/messages now live on the server (TanStack Query).
 * What stays here:
 *   - Live run state (task, steps, tabs, cursor, element table, frames)
 *   - Layout / panel sizes (localStorage for UI prefs)
 *   - Theme (localStorage)
 *   - Modal state (approval, secret)
 *   - Voice state
 *   - Agent status / control owner
 *   - Inline server messages for the current thread (ephemeral render buffer)
 */
import { create } from "zustand";
import type {
  AgentStatus,
  AgentStep,
  AgentTask,
  LayoutMode,
  Theme,
  VoiceState,
} from "@/types/pilot";

// ── Server message shape (replaces localStorage ChatMessage) ─────────────────
export interface ServerMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  resultJson?: string; // JSON string of RunResult
}

// ── Browser tab (real, from tabs_updated event) ───────────────────────────────
export interface LiveBrowserTab {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  active: boolean;
}

// ── Page element from element_table event ─────────────────────────────────────
export interface PageElement {
  index: number;
  type: "button" | "textbox" | "combobox" | "link";
  label: string;
  value?: string;
  bbox?: { x: number; y: number; w: number; h: number };
}

// ── Extended approval (includes risk + screenshot from real backend) ──────────
export interface ApprovalRequest {
  id: string;
  title: string;
  summary: string;
  amount?: string;
  risk?: string;
  screenshot?: string; // base64
  timeoutSeconds?: number;
}

// ── Extended secret fields ─────────────────────────────────────────────────────
export interface SecretField {
  key: string;
  label: string;
  kind: string;
}

export interface SecretRequest {
  id: string;
  title: string;
  fields: SecretField[];
}

// ── Store interface ───────────────────────────────────────────────────────────
interface PilotState {
  // Layout
  layoutMode: LayoutMode;
  panelSizes: [number, number];
  panelFocus: "balanced" | "chat" | "browser";
  mobileView: "chat" | "browser";

  // Theme (localStorage)
  theme: Theme;

  // Agent run live state
  currentRunId: string | null;
  currentTask: AgentTask | null;
  steps: AgentStep[];
  agentStatus: AgentStatus;
  controlOwner: "agent" | "user";
  reconnecting: boolean;

  // Browser panel live state
  browserTabs: LiveBrowserTab[];
  activeTabId: string | null;
  lastFrame: string | null; // base64 JPEG
  lastFrameViewport: { w: number; h: number } | null;
  cursor: { x: number; y: number; elementIndex?: number };
  elementTable: PageElement[];
  inspectorOpen: boolean;

  // Modals
  approvalRequest: ApprovalRequest | null;
  secretRequest: SecretRequest | null;

  // Voice
  voiceState: VoiceState;

  // Inline message buffer (current thread's messages for rendering)
  serverMessages: ServerMessage[];
  currentAssistantId: string | null;

  // Actions
  setLayoutMode: (mode: LayoutMode) => void;
  setPanelSizes: (sizes: [number, number]) => void;
  setPanelFocus: (focus: "balanced" | "chat" | "browser") => void;
  setMobileView: (view: "chat" | "browser") => void;
  setTheme: (theme: Theme) => void;

  setCurrentRunId: (id: string | null) => void;
  setTask: (task: AgentTask | null) => void;
  updateTask: (patch: Partial<AgentTask>) => void;
  setSteps: (steps: AgentStep[]) => void;
  updateStep: (stepId: string, patch: Partial<AgentStep>) => void;
  setAgentStatus: (status: AgentStatus) => void;
  setControlOwner: (owner: "agent" | "user") => void;
  setReconnecting: (val: boolean) => void;

  setTabs: (tabs: LiveBrowserTab[]) => void;
  setLastFrame: (data: string, viewport: { w: number; h: number }) => void;
  setCursor: (cursor: { x: number; y: number; elementIndex?: number }) => void;
  setElementTable: (elements: PageElement[]) => void;
  setInspectorOpen: (open: boolean) => void;

  setApproval: (req: ApprovalRequest | null) => void;
  setSecret: (req: SecretRequest | null) => void;
  setVoiceState: (state: VoiceState) => void;

  // Message buffer (server messages for current thread view)
  setServerMessages: (messages: ServerMessage[]) => void;
  addServerMessage: (message: ServerMessage) => void;
  appendAssistantDelta: (delta: string) => void;
  finalizeAssistantMessage: () => void;
  setCurrentAssistantId: (id: string | null) => void;

  // Reset run state (called when switching threads)
  resetRunState: () => void;
}

const loadTheme = (): Theme => {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem("pilot-theme") as Theme | null) ?? "dark";
};

const loadPanelSizes = (): [number, number] => {
  if (typeof window === "undefined") return [40, 60];
  try {
    const saved = localStorage.getItem("pilot-panel-sizes");
    return saved ? (JSON.parse(saved) as [number, number]) : [40, 60];
  } catch {
    return [40, 60];
  }
};

export const usePilotStore = create<PilotState>((set, get) => ({
  // Layout
  layoutMode: "chat",
  panelSizes: loadPanelSizes(),
  panelFocus: "balanced",
  mobileView: "chat",

  // Theme
  theme: loadTheme(),

  // Run state
  currentRunId: null,
  currentTask: null,
  steps: [],
  agentStatus: "idle",
  controlOwner: "agent",
  reconnecting: false,

  // Browser
  browserTabs: [],
  activeTabId: null,
  lastFrame: null,
  lastFrameViewport: null,
  cursor: { x: 50, y: 50 },
  elementTable: [],
  inspectorOpen: false,

  // Modals
  approvalRequest: null,
  secretRequest: null,
  voiceState: "idle",

  // Messages
  serverMessages: [],
  currentAssistantId: null,

  // ── Actions ─────────────────────────────────────────────────────────────────

  setLayoutMode: (layoutMode) => set({ layoutMode }),
  setPanelSizes: (panelSizes) => {
    if (typeof window !== "undefined")
      localStorage.setItem("pilot-panel-sizes", JSON.stringify(panelSizes));
    set({ panelSizes, panelFocus: "balanced" });
  },
  setPanelFocus: (panelFocus) => set({ panelFocus }),
  setMobileView: (mobileView) => set({ mobileView }),
  setTheme: (theme) => {
    if (typeof window !== "undefined") localStorage.setItem("pilot-theme", theme);
    set({ theme });
  },

  setCurrentRunId: (currentRunId) => set({ currentRunId }),
  setTask: (currentTask) => set({ currentTask }),
  updateTask: (patch) =>
    set((s) => ({ currentTask: s.currentTask ? { ...s.currentTask, ...patch } : null })),
  setSteps: (steps) => set({ steps }),
  updateStep: (stepId, patch) =>
    set((s) => ({
      steps: s.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    })),
  setAgentStatus: (agentStatus) => set({ agentStatus }),
  setControlOwner: (controlOwner) => set({ controlOwner }),
  setReconnecting: (reconnecting) => set({ reconnecting }),

  setTabs: (tabs) =>
    set({
      browserTabs: tabs,
      activeTabId: tabs.find((t) => t.active)?.id ?? tabs.at(-1)?.id ?? null,
    }),
  setLastFrame: (data, viewport) => set({ lastFrame: data, lastFrameViewport: viewport }),
  setCursor: (cursor) => set({ cursor }),
  setElementTable: (elementTable) => set({ elementTable }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),

  setApproval: (approvalRequest) => set({ approvalRequest }),
  setSecret: (secretRequest) => set({ secretRequest }),
  setVoiceState: (voiceState) => set({ voiceState }),

  setServerMessages: (serverMessages) => set({ serverMessages }),
  addServerMessage: (message) => set((s) => ({ serverMessages: [...s.serverMessages, message] })),
  appendAssistantDelta: (delta) =>
    set((s) => ({
      serverMessages: s.serverMessages.map((m) =>
        m.id === s.currentAssistantId ? { ...m, text: m.text + delta } : m,
      ),
    })),
  finalizeAssistantMessage: () => set({ currentAssistantId: null }),
  setCurrentAssistantId: (id) => set({ currentAssistantId: id }),

  resetRunState: () =>
    set({
      currentRunId: null,
      currentTask: null,
      steps: [],
      agentStatus: "idle",
      controlOwner: "agent",
      reconnecting: false,
      browserTabs: [],
      activeTabId: null,
      lastFrame: null,
      lastFrameViewport: null,
      cursor: { x: 50, y: 50 },
      elementTable: [],
      approvalRequest: null,
      secretRequest: null,
      layoutMode: "chat",
    }),
}));
