import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { api, ApiError } from "@/lib/api";
import { PilotShell } from "@/components/PilotShell";
import { usePilotStore } from "@/store/pilotStore";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const theme = usePilotStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    async function init() {
      try {
        // Check auth
        await api.auth.me();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          window.location.href = "/login";
          return;
        }
      }
      // Get or create a thread
      try {
        const threads = await api.threads.list();
        const first = threads[0];
        if (first != null) {
          setThreadId(first.id);
        } else {
          const t = await api.threads.create();
          setThreadId(t.id);
        }
      } catch {
        // Offline / backend not started — use a placeholder thread ID for demo
        setThreadId("offline-demo");
      } finally {
        setLoading(false);
      }
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !threadId) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="size-4 animate-spin rounded-full border-2 border-border border-t-agent" />
          Loading…
        </div>
      </div>
    );
  }

  return (
    <PilotShell
      threadId={threadId}
      onProvideSecret={() => {}}
      onCancelSecret={() => {}}
    />
  );
}
