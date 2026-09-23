import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApprovalRequest } from "@/store/pilotStore";

interface ApprovalSheetProps {
  request: ApprovalRequest;
  onApprove: () => void;
  onDecline: () => void;
}

const riskColors: Record<string, string> = {
  LOW: "text-success bg-success-soft",
  MEDIUM: "text-warning bg-warning-soft",
  HIGH: "text-destructive bg-destructive/10",
};

export function ApprovalSheet({ request, onApprove, onDecline }: ApprovalSheetProps) {
  const [remaining, setRemaining] = useState(request.timeoutSeconds ?? 300);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { clearInterval(interval); onDecline(); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onDecline]);

  const riskClass = riskColors[request.risk ?? "LOW"] ?? riskColors["LOW"] ?? "";
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div
      className="mx-3 mb-3 overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
      role="alertdialog"
      aria-label="Action requires your approval"
    >
      {/* Screenshot crop */}
      {request.screenshot && (
        <div className="overflow-hidden rounded-t-2xl border-b border-border">
          <img
            src={`data:image/jpeg;base64,${request.screenshot}`}
            alt="Preview of action"
            className="w-full max-h-32 object-cover object-center"
          />
        </div>
      )}

      <div className="flex items-start gap-4 p-5">
        <div className="grid size-10 flex-shrink-0 place-items-center rounded-xl bg-agent-soft text-agent">
          <CheckCircle2 className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold">{request.title}</p>
            {request.risk && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${riskClass}`}>
                {request.risk}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{request.summary}</p>
          {request.amount && (
            <p className="mt-2 text-lg font-bold">{request.amount}</p>
          )}
        </div>
      </div>

      {/* Timeout bar */}
      <div className="h-0.5 w-full bg-border">
        <div
          className="h-full bg-agent transition-all duration-1000"
          style={{ width: `${(remaining / (request.timeoutSeconds ?? 300)) * 100}%` }}
        />
      </div>

      <div className="flex items-center gap-2 border-t border-border px-5 py-3">
        <Button id="approval-approve-btn" className="flex-1 bg-agent text-white hover:bg-agent/90" onClick={onApprove}>
          <CheckCircle2 className="size-4" />
          Approve
        </Button>
        <Button id="approval-decline-btn" variant="outline" className="flex-1" onClick={onDecline}>
          <XCircle className="size-4" />
          Decline
        </Button>
        <span className="ml-auto font-mono text-xs text-muted-foreground">{mm}:{ss}</span>
      </div>

      <div className="flex items-center gap-2 border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
        <Info className="size-3 flex-shrink-0" />
        No action executes without your explicit approval.
      </div>
    </div>
  );
}
