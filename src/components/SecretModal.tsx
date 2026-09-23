import { useState } from "react";
import { KeyRound, Eye, EyeOff } from "lucide-react";
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

interface SecretModalProps {
  onProvide: (id: string, values: Record<string, string>) => void;
  onCancel: () => void;
}

export function SecretModal({ onProvide, onCancel }: SecretModalProps) {
  const req = usePilotStore((s) => s.secretRequest);
  const [values, setValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  if (!req) return null;

  const isPasswordKind = (kind: string) =>
    ["password", "card_number", "card_expiry", "card_cvv"].includes(kind);

  const submit = () => {
    onProvide(req.id, values);
    setValues({});
    setVisible({});
  };

  const cancel = () => {
    onCancel();
    setValues({});
    setVisible({});
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <DialogContent className="max-w-sm gap-0 p-0 overflow-hidden" aria-describedby="secret-desc">
        <div className="flex items-center gap-3 border-b border-border p-5">
          <div className="grid size-9 place-items-center rounded-xl bg-agent-soft text-agent">
            <KeyRound className="size-4" />
          </div>
          <DialogHeader className="gap-0">
            <DialogTitle className="text-base">{req.title}</DialogTitle>
            <DialogDescription id="secret-desc" className="text-xs">
              These values go directly to the browser and are never seen by the AI model.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 p-5">
          {req.fields.map((field) => {
            const isPassword = isPasswordKind(field.kind);
            const showPlain = visible[field.key];
            return (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`secret-${field.key}`}>{field.label}</Label>
                <div className="relative">
                  <Input
                    id={`secret-${field.key}`}
                    type={isPassword && !showPlain ? "password" : "text"}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                    autoComplete="off"
                    value={values[field.key] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="pr-10"
                  />
                  {isPassword && (
                    <button
                      type="button"
                      onClick={() =>
                        setVisible((prev) => ({ ...prev, [field.key]: !prev[field.key] }))
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPlain ? "Hide value" : "Show value"}
                    >
                      {showPlain ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button
            id="secret-submit-btn"
            className="flex-1 bg-agent text-white hover:bg-agent/90"
            onClick={submit}
          >
            Submit
          </Button>
          <Button variant="outline" onClick={cancel}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
