import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePilotStore } from "@/store/pilotStore";
import { ChatPanel } from "@/features/chat/ChatPanel";
import { BrowserPanel } from "@/features/browser/BrowserPanel";
import { VoiceMode } from "@/features/chat/VoiceMode";
import { TopBar } from "./TopBar";
import { HistorySidebar } from "./HistorySidebar";
import { SettingsDialog } from "./SettingsDialog";
import { CommandPalette } from "./CommandPalette";
import { SecretModal } from "./SecretModal";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRunSession } from "@/hooks/useRunSession";
import { api } from "@/lib/api";

interface PilotShellProps {
  threadId: string;
  onProvideSecret: (id: string, values: Record<string, string>) => void;
  onCancelSecret: () => void;
}

export function PilotShell({ threadId, onProvideSecret, onCancelSecret }: PilotShellProps) {
  const s = usePilotStore();
  const isMobile = useIsMobile();
  const session = useRunSession(threadId);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  /* ── Theme ── */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", s.theme === "dark");
  }, [s.theme]);

  /* ── Error toasts — watch agentStatus for failures ── */
  const prevStatus = useRef(s.agentStatus);
  useEffect(() => {
    const curr = s.agentStatus;
    if (prevStatus.current !== "failed" && curr === "failed") {
      toast.error("Agent stopped unexpectedly. You can try again.", { duration: 6000 });
    }
    if (prevStatus.current !== "waiting" && curr === "waiting") {
      toast.info("Your approval is needed to continue.", { duration: 0 });
    }
    prevStatus.current = curr;
  }, [s.agentStatus]);

  /* ── Reconnecting toast ── */
  useEffect(() => {
    if (s.reconnecting) {
      toast.warning("Connection lost — reconnecting…", { id: "reconnect", duration: 0 });
    } else {
      toast.dismiss("reconnect");
    }
  }, [s.reconnecting]);

  /* ── Frame throttling when tab hidden ── */
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        // Signal WS to slow frame rate (handled server-side per-client in future)
        // For now, just a marker for future implementation
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  /* ── Voice shortcuts ── */
  const toggleVoice = useCallback(() => setVoiceOpen((o) => !o), []);

  /* ── Keyboard shortcuts ── */
  const onKeyDown = useCallback(
    (e: globalThis.KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "k") { e.preventDefault(); setPaletteOpen((o) => !o); return; }
      if (meta && e.key === ",") { e.preventDefault(); setSettingsOpen(true); return; }
      if (meta && e.key === "\\") { e.preventDefault(); s.setLayoutMode(s.layoutMode === "chat" ? "split" : "chat"); return; }
      if (e.key === "Escape") {
        if (voiceOpen) { setVoiceOpen(false); return; }
        if (paletteOpen) { setPaletteOpen(false); return; }
        if (settingsOpen) { setSettingsOpen(false); return; }
        if (historyOpen) { setHistoryOpen(false); return; }
        if (s.agentStatus === "running") { session.stop(); return; }
      }
    },
    [paletteOpen, settingsOpen, historyOpen, voiceOpen, s, session]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  /* ── Custom events from command palette ── */
  useEffect(() => {
    const openHistory = () => setHistoryOpen(true);
    const newThread = () => {
      api.threads.create().then((t) => {
        window.location.href = `/?thread=${t.id}`;
      }).catch(() => toast.error("Could not create conversation."));
    };
    document.addEventListener("pilot:open-history", openHistory);
    document.addEventListener("pilot:new-thread", newThread);
    return () => {
      document.removeEventListener("pilot:open-history", openHistory);
      document.removeEventListener("pilot:new-thread", newThread);
    };
  }, []);

  /* ── Provide secret from modal → session ── */
  const handleProvideSecret = useCallback(
    (id: string, values: Record<string, string>) => {
      session.provideSecret(id, values);
      onProvideSecret(id, values);
    },
    [session, onProvideSecret]
  );

  /* ── Panel size persistence ── */
  const onPanelResize = (layout: Record<string, number>) => {
    const sizes = Object.values(layout);
    const a = sizes[0] ?? 40;
    const b = sizes[1] ?? 60;
    s.setPanelSizes([a, b]);
  };

  const chatFocused = s.panelFocus === "chat";
  const browserFocused = s.panelFocus === "browser";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar
        onHistoryOpen={() => setHistoryOpen(true)}
        onSettingsOpen={() => setSettingsOpen(true)}
      />

      {/* ── Main content area ── */}
      <main className="relative min-h-0 flex-1 overflow-hidden">
        {isMobile ? (
          <MobileLayout threadId={threadId} session={session} />
        ) : s.layoutMode === "chat" ? (
          <motion.div
            key="chat-only"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mx-auto flex h-full max-w-2xl flex-col"
          >
            <ChatPanel threadId={threadId} session={session} onVoiceOpen={toggleVoice} />
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key="split"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full"
            >
              <Group orientation="horizontal" onLayoutChanged={onPanelResize} className="h-full">
                {/* Chat pane */}
                <Panel
                  id="chat-pane"
                  defaultSize={`${s.panelSizes[0]}%`}
                  minSize={chatFocused ? "90%" : browserFocused ? "5%" : "28%"}
                  maxSize={chatFocused ? "90%" : browserFocused ? "5%" : "72%"}
                  className="flex flex-col"
                >
                  <ChatPanel threadId={threadId} session={session} onVoiceOpen={toggleVoice} />
                </Panel>

                {/* Resize handle */}
                <Separator
                  className={cn(
                    "relative w-1 cursor-col-resize bg-border transition-colors",
                    "hover:bg-agent/40 focus-visible:bg-agent/60 focus-visible:outline-none"
                  )}
                  aria-label="Resize panels"
                />

                {/* Browser pane */}
                <Panel
                  id="browser-pane"
                  defaultSize={`${s.panelSizes[1]}%`}
                  minSize={chatFocused ? "5%" : browserFocused ? "90%" : "28%"}
                  maxSize={chatFocused ? "5%" : browserFocused ? "90%" : "72%"}
                  className="p-3"
                >
                  <BrowserPanel />
                </Panel>
              </Group>
            </motion.div>
          </AnimatePresence>
        )}

        {/* Voice overlay — inside main so it covers content area */}
        {voiceOpen && (
          <VoiceMode session={session} onClose={() => setVoiceOpen(false)} />
        )}
      </main>

      {/* ── Global overlays ── */}
      <HistorySidebar
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelectThread={(id) => { window.location.href = `/?thread=${id}`; }}
      />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSettingsOpen={() => setSettingsOpen(true)}
      />
      <SecretModal onProvide={handleProvideSecret} onCancel={onCancelSecret} />
    </div>
  );
}

/* ── Mobile layout ── */
function MobileLayout({ threadId, session }: { threadId: string; session: ReturnType<typeof useRunSession> }) {
  const s = usePilotStore();

  return (
    <div className="flex h-full flex-col">
      {s.layoutMode === "split" && (
        <div className="flex flex-shrink-0 border-b border-border bg-card">
          {(["chat", "browser"] as const).map((view) => (
            <button
              key={view}
              id={`mobile-tab-${view}`}
              className={cn(
                "flex-1 py-2.5 text-sm font-medium capitalize transition-colors",
                s.mobileView === view
                  ? "border-b-2 border-agent text-agent"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => s.setMobileView(view)}
            >
              {view}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {s.layoutMode === "split" && s.mobileView === "browser" ? (
          <div className="h-full p-2">
            <BrowserPanel />
          </div>
        ) : (
          <ChatPanel threadId={threadId} session={session} onVoiceOpen={() => {}} />
        )}
      </div>

      {Boolean(s.currentTask) && s.mobileView === "chat" && s.layoutMode === "split" && (
        <motion.button
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mx-3 mb-3 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs text-muted-foreground shadow-md"
          onClick={() => s.setMobileView("browser")}
        >
          <Smartphone className="size-3.5 text-agent" />
          <span className="flex-1 truncate">{s.currentTask?.currentAction}</span>
          <span className="text-agent">View →</span>
        </motion.button>
      )}
    </div>
  );
}
