import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePilotStore } from "@/store/pilotStore";
import type { ChatThread } from "@/types/pilot";

interface HistorySidebarProps {
  open: boolean;
  onClose: () => void;
}

function ThreadItem({
  thread,
  isActive,
  onSelect,
  onClear,
}: {
  thread: ChatThread;
  isActive: boolean;
  onSelect: () => void;
  onClear: () => void;
}) {
  const date = new Date(thread.updatedAt);
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <button
      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
        isActive ? "bg-agent-soft text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
      onClick={onSelect}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium leading-5">{thread.title}</p>
        <p className="text-xs opacity-60">{thread.messages.length} messages · {timeStr}</p>
      </div>
      <button
        className="invisible size-6 flex-shrink-0 rounded-lg hover:bg-destructive/15 hover:text-destructive group-hover:visible"
        onClick={(e) => { e.stopPropagation(); onClear(); }}
        aria-label={`Clear thread "${thread.title}"`}
        tabIndex={-1}
      >
        <Trash2 className="m-auto size-3.5" />
      </button>
    </button>
  );
}

export function HistorySidebar({ open, onClose }: HistorySidebarProps) {
  const s = usePilotStore();

  const newThread = () => {
    const id = s.createThread();
    s.setActiveThread(id);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-overlay"
            onClick={onClose}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Drawer */}
      <AnimatePresence>
        {open && (
          <motion.aside
            key="drawer"
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ type: "spring", stiffness: 160, damping: 26 }}
            className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card shadow-xl"
            aria-label="Conversation history"
            role="navigation"
          >
            <div className="flex h-12 items-center justify-between px-4 border-b border-border flex-shrink-0">
              <p className="text-sm font-semibold">History</p>
              <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Close history">
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {s.threads.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">No conversations yet.</p>
              ) : (
                s.threads.map((t) => (
                  <ThreadItem
                    key={t.id}
                    thread={t}
                    isActive={t.id === s.activeThreadId}
                    onSelect={() => { s.setActiveThread(t.id); onClose(); }}
                    onClear={() => s.clearThread(t.id)}
                  />
                ))
              )}
            </div>

            <div className="border-t border-border p-3">
              <Button
                id="new-conversation-btn"
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={newThread}
              >
                <Plus className="size-4" />
                New conversation
              </Button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
