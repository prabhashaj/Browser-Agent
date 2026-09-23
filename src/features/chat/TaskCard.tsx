import { motion } from "framer-motion";
import { Plane, Pizza, Laptop, CheckCircle2, AlertCircle } from "lucide-react";
import { usePilotStore } from "@/store/pilotStore";
import type { ResultKind } from "@/types/pilot";

const icons: Record<ResultKind, typeof Plane> = {
  flight: Plane,
  food: Pizza,
  products: Laptop,
};

const scenarioLabel: Record<ResultKind, string> = {
  flight: "Flight",
  food: "Food delivery",
  products: "Research",
};

export function TaskCard() {
  const task = usePilotStore((s) => s.currentTask);
  if (!task) return null;

  const Icon = icons[task.scenario];
  const isDone = task.status === "done";
  const isFailed = task.status === "failed";

  return (
    <motion.div
      layout
      initial={{ y: -8, opacity: 0, scale: 0.98 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 140, damping: 22 }}
      className="mx-4 mb-3 overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="grid size-8 flex-shrink-0 place-items-center rounded-xl bg-agent-soft text-agent">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{task.title}</p>
          <p className="truncate text-xs text-muted-foreground">{task.currentAction}</p>
        </div>
        <span className="flex-shrink-0 rounded-full bg-agent-soft px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-agent">
          {scenarioLabel[task.scenario]}
        </span>
      </div>
      {/* Progress bar */}
      <div className="h-1 w-full bg-border">
        <motion.div
          className={`h-full rounded-r-full ${isDone ? "bg-success" : isFailed ? "bg-destructive" : "bg-agent"}`}
          initial={{ width: "0%" }}
          animate={{ width: `${task.progress}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      {/* Status row */}
      {(isDone || isFailed) && (
        <div className={`flex items-center gap-2 px-4 py-2 text-xs font-medium ${isDone ? "text-success" : "text-destructive"}`}>
          {isDone ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
          {isDone ? "Task complete" : "Task failed"}
        </div>
      )}
    </motion.div>
  );
}
