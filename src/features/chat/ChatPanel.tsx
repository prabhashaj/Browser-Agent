import { usePilotStore } from "@/store/pilotStore";
import { Transcript } from "./Transcript";
import { TaskCard } from "./TaskCard";
import { ActivityTimeline } from "./ActivityTimeline";
import { Composer } from "./Composer";
import { EmptyGreeting } from "./EmptyGreeting";
import { VoiceMode } from "@/features/voice/VoiceMode";
import { ApprovalSheet } from "@/components/ApprovalSheet";
import { agentService } from "@/services/mockAgent";

const id = () => Math.random().toString(36).slice(2, 10);

export function ChatPanel() {
  const s = usePilotStore();
  const threadId = s.activeThreadId!;
  const thread = s.threads.find((t) => t.id === threadId);
  const messages = thread?.messages ?? [];
  const isEmpty = messages.length === 0;
  const inVoice = s.voiceState !== "idle";
  const layoutMode = s.layoutMode;

  const handlePrompt = async (text: string) => {
    // Delegate to Composer's send logic via a synthetic event — we trigger by
    // pre-filling a dummy message directly to avoid duplicating the async loop.
    // Instead, we just dispatch through the Composer's exposed send path by
    // simulating through the store's addMessage + agentService calls inline.
    // The cleanest way: set draft externally isn't possible, so we duplicate
    // the send logic here for suggestion chips.
    const userMsgId = id();
    s.addMessage(threadId, { id: userMsgId, role: "user", text, createdAt: Date.now() });
    const assistantId = id();
    s.addMessage(threadId, { id: assistantId, role: "assistant", text: "", createdAt: Date.now() });
    s.setAgentStatus("thinking");

    const gen = agentService.sendMessage(text);
    let gotTask = false;

    for await (const event of gen) {
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
          s.updateTab({ id: `tab-${event.page}`, title: event.page, url: `pilot://${event.page}`, page: event.page, loading: false });
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
          s.addMessage(threadId, { id: id(), role: "assistant", text: event.message, createdAt: Date.now(), result: event.result });
          break;
        case "task_failed":
          s.updateTask({ status: "failed" });
          s.setAgentStatus("idle");
          s.addMessage(threadId, { id: id(), role: "assistant", text: event.message, createdAt: Date.now() });
          break;
      }
    }
    if (!gotTask) s.setAgentStatus("idle");
  };

  return (
    <section
      className="relative flex h-full min-w-0 flex-col overflow-hidden"
      aria-label="Conversation panel"
    >
      {/* Voice overlay */}
      {inVoice && (
        <VoiceMode compact={layoutMode === "split"} />
      )}

      {isEmpty ? (
        <EmptyGreeting onPrompt={handlePrompt} />
      ) : (
        <Transcript threadId={threadId} />
      )}

      {/* Task widgets */}
      <TaskCard />
      <ActivityTimeline />
      <ApprovalSheet />

      {/* Composer */}
      <Composer threadId={threadId} />
    </section>
  );
}
