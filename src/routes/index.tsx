import { createFileRoute } from "@tanstack/react-router";
import { PilotShell } from "@/components/PilotShell";

export const Route = createFileRoute("/")({
  component: PilotPage,
});

function PilotPage() {
  return <PilotShell />;
}
