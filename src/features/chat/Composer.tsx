import { useRef, useState, useCallback } from "react";
import { ArrowUp, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePilotStore } from "@/store/pilotStore";
import type { RunSessionHandle } from "@/hooks/useRunSession";
import { VoiceMode } from "@/features/voice/VoiceMode";

interface ComposerProps {
  session: RunSessionHandle;
}

export function Composer({ session }: ComposerProps) {
  const agentStatus = usePilotStore((s) => s.agentStatus);
  const voiceState = usePilotStore((s) => s.voiceState);
  const setVoiceState = usePilotStore((s) => s.setVoiceState);

  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isRunning = agentStatus === "running" || agentStatus === "thinking" || agentStatus === "waiting";

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || isRunning) return;
    setDraft("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await session.send(text);
  }, [draft, isRunning, session]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    // Auto-grow
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="flex flex-col gap-0">
      {/* Voice mode overlay (compact in split mode) */}
      <VoiceMode compact />

      <div className="mx-4 mb-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm focus-within:border-agent/50 focus-within:shadow-md transition-all">
        <textarea
          ref={textareaRef}
          id="composer-textarea"
          className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm placeholder:text-muted-foreground focus:outline-none"
          placeholder="Ask Pilot to do anything on the web…"
          rows={1}
          value={draft}
          onChange={onInput}
          onKeyDown={onKeyDown}
          disabled={isRunning}
          aria-label="Message input"
          style={{ maxHeight: 200 }}
        />
        <div className="flex items-center justify-between px-3 pb-3">
          <Button
            variant="ghost"
            size="icon"
            className={`size-8 transition-colors ${voiceState !== "idle" ? "text-agent" : "text-muted-foreground"}`}
            onClick={() => setVoiceState(voiceState === "idle" ? "listening" : "idle")}
            aria-label="Start voice conversation"
          >
            <Mic className="size-4" />
          </Button>
          <Button
            id="composer-send-btn"
            size="icon"
            className="size-8 rounded-xl bg-agent text-white hover:bg-agent/90 disabled:opacity-40"
            disabled={isRunning ? false : !draft.trim()}
            onClick={isRunning ? session.stop : submit}
            aria-label={isRunning ? "Stop agent" : "Send message"}
          >
            {isRunning ? <Square className="size-3.5 fill-current" /> : <ArrowUp className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
