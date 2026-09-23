import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, CheckCircle2, Circle, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePilotStore } from "@/store/pilotStore";
import type { AgentStep } from "@/types/pilot";

const StatusIcon = ({ status }: { status: AgentStep["status"] }) => {
  if (status === "done") return <CheckCircle2 className="size-3.5 text-success flex-shrink-0" />;
  if (status === "running") return <Loader2 className="size-3.5 text-agent animate-spin flex-shrink-0" />;
  if (status === "blocked") return <AlertCircle className="size-3.5 text-destructive flex-shrink-0" />;
  return <Circle className="size-3.5 text-muted-foreground/40 flex-shrink-0" />;
};

export function ActivityTimeline() {
  const steps = usePilotStore((s) => s.steps);
  const [open, setOpen] = useState(true);

  if (steps.length === 0) return null;

  const doneCount = steps.filter((s) => s.status === "done").length;

  return (
    <div className="mx-4 mb-3 rounded-2xl border border-border bg-card overflow-hidden">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="activity-timeline"
        id="timeline-toggle"
      >
        <span className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">
            {doneCount}/{steps.length}
          </span>
          Activity
        </span>
        <Button variant="ghost" size="icon-sm" asChild tabIndex={-1} aria-hidden="true">
          <span>{open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</span>
        </Button>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="activity-timeline"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5 border-t border-border px-3 py-2">
              {steps.map((step, i) => (
                <motion.div
                  key={step.id}
                  initial={{ x: -4, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className={`flex items-center gap-3 rounded-xl px-2 py-2 text-xs transition-colors ${
                    step.status === "running"
                      ? "bg-agent-soft"
                      : step.status === "done"
                      ? "text-muted-foreground"
                      : ""
                  }`}
                >
                  <StatusIcon status={step.status} />
                  <span className="font-mono text-[10px] text-muted-foreground w-4 flex-shrink-0">
                    {step.index}
                  </span>
                  <span className={`flex-1 truncate ${step.status === "running" ? "font-medium text-foreground" : ""}`}>
                    {step.target}
                  </span>
                  <span className="flex-shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                    {step.operation}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
