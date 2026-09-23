import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePilotStore } from "@/store/pilotStore";
import { ChatPanel } from "@/features/chat/ChatPanel";
import { BrowserPanel } from "@/features/browser/BrowserPanel";
import { TopBar } from "./TopBar";
import { HistorySidebar } from "./HistorySidebar";
import { SettingsDialog } from "./SettingsDialog";
import { CommandPalette } from "./CommandPalette";
import { SecretModal } from "./SecretModal";
import { useIsMobile } from "@/hooks/use-mobile";

export function PilotShell() {
  const s = usePilotStore();
  const isMobile = useIsMobile();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  /* ── Hydrate & boot ── */
  useEffect(() => {
    s.hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!s.hydrated) return;
    if (!s.activeThreadId || s.threads.length === 0) {
      const newId = s.createThread();
      s.setActiveThread(newId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.hydrated]);

  /* ── Theme applied to <html> ── */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", s.theme === "dark");
  }, [s.theme]);

  /* ── Keyboard shortcuts ── */
  const onKeyDown = useCallback(
    (e: globalThis.KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "k") { e.preventDefault(); setPaletteOpen((o) => !o); return; }
      if (meta && e.key === ",") { e.preventDefault(); setSettingsOpen(true); return; }
      if (e.key === "Escape") {
        if (paletteOpen) { setPaletteOpen(false); return; }
        if (settingsOpen) { setSettingsOpen(false); return; }
        if (historyOpen) { setHistoryOpen(false); return; }
      }
    },
    [paletteOpen, settingsOpen, historyOpen]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  /* ── History open via command palette dispatch ── */
  useEffect(() => {
    const handler = () => setHistoryOpen(true);
    document.addEventListener("pilot:open-history", handler);
    return () => document.removeEventListener("pilot:open-history", handler);
  }, []);

  /* ── Panel size persistence ── */
  const onPanelResize = (layout: Record<string, number>) => {
    const sizes = Object.values(layout);
    const a = sizes[0] ?? 40;
    const b = sizes[1] ?? 60;
    s.setPanelSizes([a, b]);
  };

  if (!s.hydrated || !s.activeThreadId) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="size-4 animate-spin rounded-full border-2 border-border border-t-agent" />
          Loading…
        </div>
      </div>
    );
  }

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
          <MobileLayout />
        ) : s.layoutMode === "chat" ? (
          <motion.div
            key="chat-only"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mx-auto flex h-full max-w-2xl flex-col"
          >
            <ChatPanel />
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key="split"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full"
            >
              <Group
                orientation="horizontal"
                onLayoutChanged={onPanelResize}
                className="h-full"
              >
                {/* Chat pane */}
                <Panel
                  id="chat-pane"
                  defaultSize={`${s.panelSizes[0]}%`}
                  minSize={chatFocused ? "90%" : browserFocused ? "5%" : "28%"}
                  maxSize={chatFocused ? "90%" : browserFocused ? "5%" : "72%"}
                  className="flex flex-col"
                >
                  <ChatPanel />
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
      </main>

      {/* ── Global overlays ── */}
      <HistorySidebar open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSettingsOpen={() => setSettingsOpen(true)}
      />
      <SecretModal />
    </div>
  );
}

/* ── Mobile layout ── */
function MobileLayout() {
  const s = usePilotStore();
  const hasTask = Boolean(s.currentTask);

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
          <ChatPanel />
        )}
      </div>

      {/* Floating action preview on chat tab */}
      {hasTask && s.mobileView === "chat" && s.layoutMode === "split" && (
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
