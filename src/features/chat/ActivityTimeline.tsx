import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Circle, Loader2, AlertCircle } from "lucide-react";
import { usePilotStore } from "@/store/pilotStore";
import type { AgentStep } from "@/types/pilot";

const STATUS_ICON = {
  pending: <Circle className="size-3 text-muted-foreground/40" />,
  running: <Loader2 className="size-3 animate-spin text-agent" />,
  done: <CheckCircle2 className="size-3 text-success" />,
  blocked: <AlertCircle className="size-3 text-destructive" />,
} satisfies Record<AgentStep["status"], React.ReactNode>;

function StepRow({ step }: { step: AgentStep }) {
  return (
    <motion.div
      layout
      initial={{ x: -6, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs ${
        step.status === "running" ? "bg-agent-soft" : ""
      }`}
    >
      {STATUS_ICON[step.status]}
      <span
        className={`truncate ${
          step.status === "done"
            ? "text-muted-foreground line-through"
            : step.status === "running"
            ? "font-medium text-foreground"
            : step.status === "blocked"
            ? "text-destructive"
            : "text-muted-foreground"
        }`}
      >
        {step.target}
      </span>
      {step.status === "running" && (
        <span className="ml-auto shrink-0 text-[10px] font-medium text-agent">Running</span>
      )}
    </motion.div>
  );
}

export function ActivityTimeline() {
  const steps = usePilotStore((s) => s.steps);
  const agentStatus = usePilotStore((s) => s.agentStatus);

  const isActive = agentStatus === "running" || agentStatus === "thinking" || agentStatus === "waiting";
  if (!isActive && steps.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="mx-4 mb-2 overflow-hidden rounded-2xl border border-border bg-card"
      >
        <div className="px-1 py-1">
          <AnimatePresence initial={false}>
            {steps.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </AnimatePresence>
          {steps.length === 0 && agentStatus === "thinking" && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin text-agent" />
              Thinking…
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
