import { useRef, useState, useCallback, type KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePilotStore } from "@/store/pilotStore";
import { agentService } from "@/services/mockAgent";
import type { AgentEvent } from "@/types/pilot";

const id = () => Math.random().toString(36).slice(2, 10);

interface ComposerProps {
  threadId: string;
}

export function Composer({ threadId }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const s = usePilotStore();
  const busy = s.agentStatus !== "idle";

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setDraft("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      // Ensure split mode opens when a browser task starts
      const userMsgId = id();
      s.addMessage(threadId, { id: userMsgId, role: "user", text: trimmed, createdAt: Date.now() });

      const assistantId = id();
      s.addMessage(threadId, { id: assistantId, role: "assistant", text: "", createdAt: Date.now() });
      s.setAgentStatus("thinking");

      const gen = agentService.sendMessage(trimmed);
      let gotTask = false;

      for await (const event of gen as AsyncGenerator<AgentEvent>) {
        const fresh = usePilotStore.getState();

        switch (event.type) {
          case "message_delta":
            s.appendAssistant(threadId, assistantId, event.delta);
            if (fresh.agentStatus === "thinking") s.setAgentStatus("running");
            break;

          case "message_done":
            s.setAgentStatus("idle");
            break;

          case "task_started":
            gotTask = true;
            s.setTask(event.task);
            s.setAgentStatus("running");
            if (fresh.layoutMode === "chat") s.setLayoutMode("split");
            break;

          case "plan":
            s.setSteps(event.steps);
            break;

          case "step_started":
            s.updateStep(event.stepId, { status: "running" });
            s.updateTask({ currentAction: event.action, status: "running" });
            break;

          case "step_finished":
            s.updateStep(event.stepId, { status: "done" });
            s.updateTask({
              progress: Math.round(
                (fresh.steps.filter((x) => x.status === "done").length /
                  Math.max(fresh.steps.length, 1)) *
                  100
              ),
            });
            break;

          case "browser_navigate":
            s.updateTab(event.tab);
            break;

          case "browser_frame":
            s.updateTab({
              id: `tab-${event.page}`,
              title: event.page,
              url: `pilot://${event.page}`,
              page: event.page,
              loading: false,
            });
            break;

          case "cursor_move":
            s.setCursor({ x: event.x, y: event.y });
            break;

          case "element_highlight":
            s.setCursor({ ...usePilotStore.getState().cursor, elementIndex: event.index });
            break;

          case "approval_required":
            s.setApproval(event.request);
            s.setAgentStatus("waiting");
            break;

          case "secret_required":
            s.setSecret(event.request);
            s.setAgentStatus("waiting");
            break;

          case "task_finished":
            s.updateTask({ status: "done", progress: 100 });
            s.setAgentStatus("idle");
            // Patch the assistant message with the result card
            s.addMessage(threadId, {
              id: id(),
              role: "assistant",
              text: event.message,
              createdAt: Date.now(),
              result: event.result,
            });
            break;

          case "task_failed":
            s.updateTask({ status: "failed" });
            s.setAgentStatus("idle");
            s.addMessage(threadId, {
              id: id(),
              role: "assistant",
              text: event.message,
              createdAt: Date.now(),
            });
            break;
        }
      }

      if (!gotTask) s.setAgentStatus("idle");
    },
    [threadId, busy, s]
  );

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  };

  const startVoice = () => {
    agentService.startVoice();
    s.setVoiceState("listening");
  };

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="relative flex items-end gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm transition-shadow focus-within:shadow-md focus-within:border-agent/50">
        <textarea
          ref={textareaRef}
          id="composer-input"
          rows={1}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); autoResize(); }}
          onKeyDown={onKeyDown}
          placeholder="Message Pilot…"
          disabled={busy && s.agentStatus === "waiting"}
          className="min-h-[24px] flex-1 resize-none bg-transparent text-sm leading-6 placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          aria-label="Message input"
          style={{ maxHeight: 160 }}
        />
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <AnimatePresence mode="wait">
            {busy ? (
              <motion.div key="stop" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}>
                <Button
                  id="stop-btn"
                  size="icon"
                  variant="ghost"
                  className="size-8 text-destructive hover:bg-destructive/10"
                  onClick={() => { agentService.stop(); s.setAgentStatus("idle"); }}
                  aria-label="Stop"
                >
                  <Square className="size-3.5 fill-current" />
                </Button>
              </motion.div>
            ) : (
              <motion.div key="voice" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}>
                <Button
                  id="voice-btn"
                  size="icon"
                  variant="ghost"
                  className="size-8 text-muted-foreground hover:text-agent"
                  onClick={startVoice}
                  aria-label="Start voice conversation"
                >
                  <Mic className="size-4" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <Button
            id="send-btn"
            size="icon"
            disabled={!draft.trim() || busy}
            onClick={() => send(draft)}
            className="size-8 rounded-xl bg-agent text-white hover:bg-agent/90 disabled:opacity-40"
            aria-label="Send message"
          >
            <ArrowUp className="size-4" />
          </Button>
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        Pilot is a demo — mock flows only. No real bookings or purchases.
      </p>
    </div>
  );
}
