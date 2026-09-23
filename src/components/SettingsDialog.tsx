import { Moon, Sun, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePilotStore } from "@/store/pilotStore";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const theme = usePilotStore((s) => s.theme);
  const setTheme = usePilotStore((s) => s.setTheme);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm" aria-describedby="settings-desc">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription id="settings-desc">
            Preferences for this browser session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Theme */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Appearance</p>
              <p className="text-xs text-muted-foreground">Dark or light interface</p>
            </div>
            <div className="flex gap-1 rounded-xl border border-border p-1">
              <Button
                id="theme-dark-btn"
                size="icon"
                variant={theme === "dark" ? "secondary" : "ghost"}
                className="size-7 rounded-lg"
                onClick={() => setTheme("dark")}
                aria-label="Dark mode"
                aria-pressed={theme === "dark"}
              >
                <Moon className="size-3.5" />
              </Button>
              <Button
                id="theme-light-btn"
                size="icon"
                variant={theme === "light" ? "secondary" : "ghost"}
                className="size-7 rounded-lg"
                onClick={() => setTheme("light")}
                aria-label="Light mode"
                aria-pressed={theme === "light"}
              >
                <Sun className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* About */}
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 size-4 flex-shrink-0 text-muted-foreground" />
              <div className="space-y-1 text-xs text-muted-foreground">
                <p><span className="font-semibold text-foreground">USE_MOCK = true</span></p>
                <p>All agent activity is simulated locally. No network calls, no real bookings, no credentials stored.</p>
                <p>To connect a real backend, implement the <code className="font-mono bg-border px-1 rounded">AgentService</code> interface in <code className="font-mono bg-border px-1 rounded">src/services/</code>.</p>
              </div>
            </div>
          </div>

          {/* Keyboard shortcuts */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Keyboard shortcuts</p>
            <div className="space-y-1.5 text-xs">
              {[
                ["Open command palette", "⌘ K"],
                ["Close / Stop", "Esc"],
                ["Settings", "⌘ ,"],
              ].map(([action, key]) => (
                <div key={action} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{action}</span>
                  <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[10px]">{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
