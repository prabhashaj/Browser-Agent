import { useState } from "react";
import { KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePilotStore } from "@/store/pilotStore";
import { agentService } from "@/services/mockAgent";

export function SecretModal() {
  const req = usePilotStore((s) => s.secretRequest);
  const setSecret = usePilotStore((s) => s.setSecret);
  const [values, setValues] = useState<Record<string, string>>({});

  if (!req) return null;

  const submit = () => {
    agentService.provideSecret(req.id);
    setSecret(null);
    setValues({});
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) { agentService.stop(); setSecret(null); } }}>
      <DialogContent className="max-w-sm gap-0 p-0 overflow-hidden" aria-describedby="secret-desc">
        <div className="flex items-center gap-3 border-b border-border p-5">
          <div className="grid size-9 place-items-center rounded-xl bg-agent-soft text-agent">
            <KeyRound className="size-4" />
          </div>
          <DialogHeader className="gap-0">
            <DialogTitle className="text-base">{req.title}</DialogTitle>
            <DialogDescription id="secret-desc" className="text-xs">
              Pilot needs these details to continue. Nothing is sent anywhere.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-4 p-5">
          {req.fields.map((field) => (
            <div key={field} className="space-y-1.5">
              <Label htmlFor={`secret-${field}`} className="capitalize">
                {field}
              </Label>
              <Input
                id={`secret-${field}`}
                type="password"
                placeholder={`Enter ${field.toLowerCase()}`}
                autoComplete="off"
                value={values[field] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button
            id="secret-submit-btn"
            className="flex-1 bg-agent text-white hover:bg-agent/90"
            onClick={submit}
          >
            Submit
          </Button>
          <Button
            variant="outline"
            onClick={() => { agentService.stop(); setSecret(null); }}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
