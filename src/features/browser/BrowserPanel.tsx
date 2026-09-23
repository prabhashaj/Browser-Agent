import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Bug, ChevronsLeft, ChevronsRight, CirclePause, Globe2, LockKeyhole, Maximize2, Minimize2, MoreHorizontal, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePilotStore } from "@/store/pilotStore";

export function BrowserPanel() {
  const s = usePilotStore();
  const tabs = s.browserTabs;
  const activeTabId = s.activeTabId;
  const tab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const task = s.currentTask;
  const waiting = Boolean(s.approvalRequest || s.secretRequest);
  const elapsed = task ? Math.max(1, Math.round((Date.now() - task.startedAt) / 1000)) : 0;
  const close = () => { s.setLayoutMode("chat"); s.setPanelFocus("balanced"); };

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-browser-shell shadow-browser" aria-label="Live browser">
      {/* Window chrome — traffic lights + tabs */}
      <div className="flex h-11 items-center gap-2 border-b border-border px-3">
        <div className="flex gap-1.5" aria-hidden="true">
          <i className="traffic bg-danger" />
          <i className="traffic bg-warning" />
          <i className="traffic bg-success" />
        </div>
        <div className="ml-2 flex min-w-0 flex-1 items-end self-end gap-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => s.setTabs(tabs.map((t) => ({ ...t, active: t.id === item.id })))}
              className={`browser-tab ${item.id === activeTabId ? "browser-tab-active" : ""}`}
            >
              <Globe2 className="size-3.5" />
              <span className="truncate">{item.title || "New tab"}</span>
              {item.loading && <span className="ml-auto size-2 animate-spin rounded-full border border-agent border-t-transparent" />}
              <X className="ml-auto size-3 opacity-50" />
            </button>
          ))}
          <Button variant="ghost" size="icon-sm" aria-label="New tab"><Plus /></Button>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => s.setPanelFocus(s.panelFocus === "browser" ? "balanced" : "browser")} aria-label="Maximize browser">
          {s.panelFocus === "browser" ? <Minimize2 /> : <Maximize2 />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close browser"><X /></Button>
      </div>

      {/* Address bar */}
      <div className="relative flex h-12 items-center gap-1.5 border-b border-border px-3">
        <Button variant="ghost" size="icon-sm" aria-label="Back" disabled={s.controlOwner !== "user"}><ArrowLeft /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Forward" disabled={s.controlOwner !== "user"}><ArrowRight /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Reload" disabled={s.controlOwner !== "user"}><RefreshCw /></Button>
        <div className="mx-2 flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-browser-address px-3 py-2 text-xs text-muted-foreground">
          <LockKeyhole className="size-3" />
          <span className="truncate">{tab?.url ?? "pilot://new-tab"}</span>
        </div>
        <Button variant={s.inspectorOpen ? "secondary" : "ghost"} size="icon-sm" onClick={() => s.setInspectorOpen(!s.inspectorOpen)} aria-label="Toggle element inspector"><Bug /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Browser menu"><MoreHorizontal /></Button>
        {s.agentStatus === "running" && (
          <motion.div layoutId="loading-line" className="absolute inset-x-0 bottom-0 h-px bg-agent" />
        )}
      </div>

      {/* Viewport — real canvas frame or placeholder */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {s.lastFrame ? (
          <AnimatePresence>
            <motion.img
              key="live-frame"
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 1 }}
              src={`data:image/jpeg;base64,${s.lastFrame}`}
              alt="Live browser view"
              className="size-full object-contain"
            />
          </AnimatePresence>
        ) : (
          <div className="flex size-full items-center justify-center bg-browser-address">
            <div className="text-center">
              <Globe2 className="mx-auto size-12 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">Browser ready</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Start a task to see a live session</p>
            </div>
          </div>
        )}

        {/* Agent cursor */}
        <motion.div
          animate={{ left: `${s.cursor.x}%`, top: `${s.cursor.y}%` }}
          transition={{ type: "spring", stiffness: 85, damping: 17 }}
          className="agent-cursor"
          style={{ display: s.lastFrame ? "block" : "none" }}
        >
          <div className="cursor-arrow" />
          <span />
        </motion.div>

        {/* Action pill */}
        {task && (
          <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2">
            <div className="glass-pill">
              <span className="live-dot" />
              Pilot is browsing{" "}
              <span className="max-w-60 truncate text-muted-foreground">{task.currentAction}</span>
            </div>
          </div>
        )}

        {/* Waiting overlay */}
        {waiting && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-overlay">
            <div className="glass-pill text-warning">
              <CirclePause className="size-4" />
              Waiting for your approval
            </div>
          </div>
        )}

        {/* Takeover banner */}
        {s.controlOwner === "user" && (
          <div className="absolute inset-x-4 top-4 z-30 flex items-center justify-between rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-warning">
            <span>You're in control.</span>
            <Button size="sm" variant="outline" onClick={() => s.setControlOwner("agent")}>Resume agent</Button>
          </div>
        )}

        {/* Element inspector drawer */}
        <AnimatePresence>
          {s.inspectorOpen && (
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              className="absolute inset-y-0 right-0 z-30 w-80 border-l border-border bg-browser-shell/95 p-4 backdrop-blur-xl"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Page elements</p>
                  <p className="font-mono text-[10px] text-muted-foreground">LIVE DOM SNAPSHOT</p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => s.setInspectorOpen(false)}><X /></Button>
              </div>
              <div className="mt-4 space-y-1 overflow-y-auto font-mono text-[11px]">
                {s.elementTable.map((row) => (
                  <div
                    key={row.index}
                    className={`grid grid-cols-[32px_64px_1fr] gap-2 rounded-lg p-2 ${row.index === s.cursor.elementIndex ? "bg-agent-soft text-agent" : "text-muted-foreground"}`}
                  >
                    <span>#{row.index}</span>
                    <span>{row.type}</span>
                    <span className="truncate">{row.label}{row.value != null ? ` = ${row.value}` : ""}</span>
                  </div>
                ))}
                {s.elementTable.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground/60">No elements captured yet</p>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Status bar */}
      <div className="flex h-10 items-center gap-4 border-t border-border px-3 text-[11px] text-muted-foreground">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {s.agentStatus === "running" && <span className="live-dot" />}
          <span className="truncate">{task?.currentAction ?? "Ready"}</span>
        </span>
        <span className="font-mono">{s.steps.filter((x) => x.status === "done").length}/{s.steps.length}</span>
        <span className="font-mono">00:{String(elapsed).padStart(2, "0")}</span>
        <Button variant="ghost" size="sm" onClick={() => s.controlOwner === "agent" ? s.setControlOwner("user") : s.setControlOwner("agent")}>
          {s.controlOwner === "agent" ? <><CirclePause />Take over</> : <><ShieldCheck />Resume</>}
        </Button>
      </div>
    </section>
  );
}