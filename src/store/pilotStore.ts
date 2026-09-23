import { create } from "zustand";
import type { AgentStatus, AgentStep, AgentTask, ApprovalRequest, BrowserTab, ChatMessage, ChatThread, LayoutMode, SecretRequest, Theme, VoiceState } from "@/types/pilot";

const STORAGE_KEY = "pilot-threads-v1";
const id = () => Math.random().toString(36).slice(2, 10);
const persistThreads = (threads: ChatThread[]) => {
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
};

interface PilotState {
  hydrated: boolean;
  threads: ChatThread[];
  activeThreadId: string | null;
  layoutMode: LayoutMode;
  panelSizes: [number, number];
  panelFocus: "balanced" | "chat" | "browser";
  mobileView: "chat" | "browser";
  browserTabs: BrowserTab[];
  activeTab: string | null;
  currentTask: AgentTask | null;
  steps: AgentStep[];
  agentStatus: AgentStatus;
  voiceState: VoiceState;
  theme: Theme;
  approvalRequest: ApprovalRequest | null;
  secretRequest: SecretRequest | null;
  controlOwner: "agent" | "user";
  inspectorOpen: boolean;
  cursor: { x: number; y: number; elementIndex?: number };
  hydrate: () => void;
  createThread: () => string;
  setActiveThread: (id: string) => void;
  addMessage: (threadId: string, message: ChatMessage) => void;
  appendAssistant: (threadId: string, messageId: string, delta: string) => void;
  clearThread: (threadId: string) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setPanelSizes: (sizes: [number, number]) => void;
  setPanelFocus: (focus: "balanced" | "chat" | "browser") => void;
  setMobileView: (view: "chat" | "browser") => void;
  setTabs: (tabs: BrowserTab[], active?: string) => void;
  updateTab: (tab: BrowserTab) => void;
  setTask: (task: AgentTask | null) => void;
  updateTask: (patch: Partial<AgentTask>) => void;
  setSteps: (steps: AgentStep[]) => void;
  updateStep: (stepId: string, patch: Partial<AgentStep>) => void;
  setAgentStatus: (status: AgentStatus) => void;
  setVoiceState: (state: VoiceState) => void;
  setTheme: (theme: Theme) => void;
  setApproval: (request: ApprovalRequest | null) => void;
  setSecret: (request: SecretRequest | null) => void;
  setControlOwner: (owner: "agent" | "user") => void;
  setInspectorOpen: (open: boolean) => void;
  setCursor: (cursor: { x: number; y: number; elementIndex?: number }) => void;
}

export const usePilotStore = create<PilotState>((set, get) => ({
  hydrated: false,
  threads: [],
  activeThreadId: null,
  layoutMode: "chat",
  panelSizes: [40, 60],
  panelFocus: "balanced",
  mobileView: "chat",
  browserTabs: [],
  activeTab: null,
  currentTask: null,
  steps: [],
  agentStatus: "idle",
  voiceState: "idle",
  theme: "dark",
  approvalRequest: null,
  secretRequest: null,
  controlOwner: "agent",
  inspectorOpen: false,
  cursor: { x: 48, y: 34 },
  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    let threads: ChatThread[] = [];
    try { threads = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as ChatThread[]; } catch { threads = []; }
    const theme = (window.sessionStorage.getItem("pilot-theme") as Theme | null) ?? "dark";
    const savedSizes = window.sessionStorage.getItem("pilot-panel-sizes");
    const panelSizes: [number, number] = savedSizes ? JSON.parse(savedSizes) as [number, number] : [40, 60];
    set({ threads, hydrated: true, theme, panelSizes });
  },
  createThread: () => {
    const thread: ChatThread = { id: id(), title: "New conversation", updatedAt: Date.now(), messages: [] };
    const threads = [thread, ...get().threads];
    persistThreads(threads); set({ threads, activeThreadId: thread.id }); return thread.id;
  },
  setActiveThread: (activeThreadId) => set({ activeThreadId }),
  addMessage: (threadId, message) => set((state) => {
    const threads = state.threads.map((thread) => thread.id === threadId ? {
      ...thread, title: thread.messages.length === 0 && message.role === "user" ? message.text.slice(0, 38) : thread.title,
      updatedAt: Date.now(), messages: [...thread.messages, message],
    } : thread);
    persistThreads(threads); return { threads };
  }),
  appendAssistant: (threadId, messageId, delta) => set((state) => {
    const threads = state.threads.map((thread) => thread.id === threadId ? {
      ...thread, updatedAt: Date.now(), messages: thread.messages.map((message) => message.id === messageId ? { ...message, text: message.text + delta } : message),
    } : thread);
    persistThreads(threads); return { threads };
  }),
  clearThread: (threadId) => set((state) => { const threads = state.threads.map((thread) => thread.id === threadId ? { ...thread, title: "New conversation", messages: [], updatedAt: Date.now() } : thread); persistThreads(threads); return { threads, layoutMode: "chat", currentTask: null, steps: [], browserTabs: [] }; }),
  setLayoutMode: (layoutMode) => set({ layoutMode }),
  setPanelSizes: (panelSizes) => { if (typeof window !== "undefined") window.sessionStorage.setItem("pilot-panel-sizes", JSON.stringify(panelSizes)); set({ panelSizes, panelFocus: "balanced" }); },
  setPanelFocus: (panelFocus) => set({ panelFocus }),
  setMobileView: (mobileView) => set({ mobileView }),
  setTabs: (browserTabs, activeTab) => set({ browserTabs, activeTab: activeTab ?? browserTabs.at(-1)?.id ?? null }),
  updateTab: (tab) => set((state) => ({ browserTabs: state.browserTabs.some((item) => item.id === tab.id) ? state.browserTabs.map((item) => item.id === tab.id ? tab : item) : [...state.browserTabs, tab], activeTab: tab.id })),
  setTask: (currentTask) => set({ currentTask }),
  updateTask: (patch) => set((state) => ({ currentTask: state.currentTask ? { ...state.currentTask, ...patch } : null })),
  setSteps: (steps) => set({ steps }),
  updateStep: (stepId, patch) => set((state) => ({ steps: state.steps.map((step) => step.id === stepId ? { ...step, ...patch } : step) })),
  setAgentStatus: (agentStatus) => set({ agentStatus }),
  setVoiceState: (voiceState) => set({ voiceState }),
  setTheme: (theme) => { if (typeof window !== "undefined") window.sessionStorage.setItem("pilot-theme", theme); set({ theme }); },
  setApproval: (approvalRequest) => set({ approvalRequest }),
  setSecret: (secretRequest) => set({ secretRequest }),
  setControlOwner: (controlOwner) => set({ controlOwner }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setCursor: (cursor) => set({ cursor }),
}));