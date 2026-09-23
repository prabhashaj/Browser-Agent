import { useEffect } from "react";
import { usePilotStore } from "@/store/pilotStore";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";
import { TaskCard } from "./TaskCard";
import { ActivityTimeline } from "./ActivityTimeline";
import { ApprovalSheet } from "@/components/ApprovalSheet";
import { EmptyGreeting } from "./EmptyGreeting";
import { useRunSession } from "@/hooks/useRunSession";

interface ChatPanelProps {
  threadId: string;
}

export function ChatPanel({ threadId }: ChatPanelProps) {
  const session = useRunSession(threadId);
  const serverMessages = usePilotStore((s) => s.serverMessages);
  const currentTask = usePilotStore((s) => s.currentTask);
  const agentStatus = usePilotStore((s) => s.agentStatus);
  const resetRunState = usePilotStore((s) => s.resetRunState);
  const approvalRequest = usePilotStore((s) => s.approvalRequest);

  // Reset run state whenever the thread changes
  useEffect(() => {
    resetRunState();
  }, [threadId, resetRunState]);

  const isEmpty = serverMessages.length === 0 && agentStatus === "idle";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Task progress card */}
      {currentTask && <TaskCard />}

      {/* Activity timeline */}
      <ActivityTimeline />

      {/* Message transcript or greeting */}
      {isEmpty ? (
        <EmptyGreeting onPrompt={(text) => void session.send(text)} />
      ) : (
        <Transcript messages={serverMessages} />
      )}

      {/* Approval sheet (inline, above composer) */}
      {approvalRequest && (
        <ApprovalSheet
          request={approvalRequest}
          onApprove={() => session.approve(approvalRequest.id)}
          onDecline={() => session.decline(approvalRequest.id)}
        />
      )}

      {/* Composer */}
      <Composer session={session} />
    </div>
  );
}
