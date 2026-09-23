import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { ThreadOut } from "@/lib/api";

interface HistorySidebarProps {
  open: boolean;
  onClose: () => void;
  onSelectThread?: (id: string) => void;
}

function ThreadItem({
  thread,
  onSelect,
  onDelete,
}: {
  thread: ThreadOut;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const date = new Date(thread.updated_at);
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <button
      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={onSelect}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium leading-5 text-foreground">{thread.title}</p>
        <p className="text-xs opacity-60">{thread.message_count} messages · {timeStr}</p>
      </div>
      <button
        className="invisible size-6 flex-shrink-0 rounded-lg hover:bg-destructive/15 hover:text-destructive group-hover:visible"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        aria-label={`Delete thread "${thread.title}"`}
        tabIndex={-1}
      >
        <Trash2 className="m-auto size-3.5" />
      </button>
    </button>
  );
}

export function HistorySidebar({ open, onClose, onSelectThread }: HistorySidebarProps) {
  const [threads, setThreads] = useState<ThreadOut[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.threads.list()
      .then(setThreads)
      .catch(() => setThreads([]))
      .finally(() => setLoading(false));
  }, [open]);

  const newThread = async () => {
    const t = await api.threads.create();
    onSelectThread?.(t.id);
    onClose();
  };

  const deleteThread = async (id: string) => {
    await api.threads.delete(id);
    setThreads((prev) => prev.filter((t) => t.id !== id));
  };

  const filtered = search
    ? threads.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()))
    : threads;

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

            <div className="px-3 py-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search conversations…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {loading ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {search ? "No results found." : "No conversations yet."}
                </p>
              ) : (
                filtered.map((t) => (
                  <ThreadItem
                    key={t.id}
                    thread={t}
                    onSelect={() => { onSelectThread?.(t.id); onClose(); }}
                    onDelete={() => deleteThread(t.id)}
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
