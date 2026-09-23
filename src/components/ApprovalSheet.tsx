import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePilotStore } from "@/store/pilotStore";
import { agentService } from "@/services/mockAgent";

export function ApprovalSheet() {
  const req = usePilotStore((s) => s.approvalRequest);
  const setApproval = usePilotStore((s) => s.setApproval);

  if (!req) return null;

  const approve = () => {
    agentService.approve(req.id);
    setApproval(null);
  };
  const decline = () => {
    agentService.stop();
    setApproval(null);
  };

  return (
    <div
      className="mx-3 mb-3 overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
      role="alertdialog"
      aria-label="Action requires your approval"
    >
      <div className="flex items-start gap-4 p-5">
        <div className="grid size-10 flex-shrink-0 place-items-center rounded-xl bg-agent-soft text-agent">
          <CheckCircle2 className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{req.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{req.summary}</p>
          {req.amount && (
            <p className="mt-2 text-lg font-bold">{req.amount}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2 border-t border-border px-5 py-3">
        <Button
          id="approval-approve-btn"
          className="flex-1 bg-agent text-white hover:bg-agent/90"
          onClick={approve}
        >
          <CheckCircle2 className="size-4" />
          Approve
        </Button>
        <Button
          id="approval-decline-btn"
          variant="outline"
          className="flex-1"
          onClick={decline}
        >
          <XCircle className="size-4" />
          Decline
        </Button>
      </div>
    </div>
  );
}
