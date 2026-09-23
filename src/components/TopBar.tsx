import { Moon, Sun, Clock, Settings, Mic, Wifi, WifiOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePilotStore } from "@/store/pilotStore";

interface TopBarProps {
  onHistoryOpen: () => void;
  onSettingsOpen: () => void;
}

export function TopBar({ onHistoryOpen, onSettingsOpen }: TopBarProps) {
  const theme = usePilotStore((s) => s.theme);
  const setTheme = usePilotStore((s) => s.setTheme);
  const voiceState = usePilotStore((s) => s.voiceState);
  const setVoiceState = usePilotStore((s) => s.setVoiceState);
  const reconnecting = usePilotStore((s) => s.reconnecting);
  const agentStatus = usePilotStore((s) => s.agentStatus);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const startVoice = () => {
    setVoiceState(voiceState === "idle" ? "listening" : "idle");
  };

  // Connection status indicator
  const isConnected = agentStatus !== "idle" && !reconnecting;
  const isOffline = reconnecting;

  return (
    <header
      className="flex h-12 flex-shrink-0 items-center justify-between border-b border-border/50 px-4"
      aria-label="Pilot top bar"
    >
      {/* Identity mark + wordmark */}
      <div className="flex items-center gap-2.5" aria-label="Pilot">
        <div className="grid size-7 place-items-center rounded-lg bg-agent-soft">
          <svg width="16" height="16" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <path
              d="M10 8h9a7 7 0 0 1 0 14h-7v8"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-agent"
            />
          </svg>
        </div>
        <span className="text-sm font-semibold tracking-tight">Pilot</span>

        {/* Connection status */}
        {isOffline ? (
          <span className="flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-warning">
            <Loader2 className="size-2.5 animate-spin" />
            Reconnecting
          </span>
        ) : isConnected ? (
          <span className="flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-success">
            <span className="live-dot" />
            Live
          </span>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button
          id="history-btn"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={onHistoryOpen}
          aria-label="Open conversation history"
        >
          <Clock className="size-4" />
        </Button>
        <Button
          id="voice-topbar-btn"
          variant="ghost"
          size="icon"
          className={`size-8 transition-colors ${voiceState !== "idle" ? "text-agent" : "text-muted-foreground hover:text-foreground"}`}
          onClick={startVoice}
          aria-label="Start voice conversation"
        >
          <Mic className="size-4" />
        </Button>
        <Button
          id="theme-toggle-btn"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        <Button
          id="settings-btn"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={onSettingsOpen}
          aria-label="Open settings"
        >
          <Settings className="size-4" />
        </Button>
      </div>
    </header>
  );
}
