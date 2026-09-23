import { Plane, ShoppingBag, Search, Zap } from "lucide-react";

const SUGGESTIONS = [
  { icon: Plane, label: "Book a round-trip flight to Tokyo for next month" },
  { icon: ShoppingBag, label: "Order a margherita pizza from a nearby restaurant" },
  { icon: Search, label: "Compare the best laptops under $1,000 on sale now" },
  { icon: Zap, label: "Find today's top news headlines and summarise them" },
];

interface EmptyGreetingProps {
  onPrompt: (text: string) => void;
}

export function EmptyGreeting({ onPrompt }: EmptyGreetingProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-6">
      {/* Wordmark */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="grid size-14 place-items-center rounded-2xl bg-agent-soft ring-1 ring-agent/20">
          <svg width="28" height="28" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <path
              d="M10 8h9a7 7 0 0 1 0 14h-7v8"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-agent"
            />
          </svg>
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">What can I help with?</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Chat freely, or ask me to browse the real web on your behalf.
          </p>
        </div>
      </div>

      {/* Suggestions */}
      <div className="grid w-full max-w-lg grid-cols-2 gap-2.5">
        {SUGGESTIONS.map(({ icon: Icon, label }) => (
          <button
            key={label}
            onClick={() => onPrompt(label)}
            className="group flex min-h-[72px] flex-col items-start gap-2 rounded-2xl border border-border bg-card px-4 py-3.5 text-left text-sm transition-all hover:border-agent/40 hover:bg-accent hover:shadow-sm active:scale-[0.98]"
          >
            <Icon className="size-4 text-agent opacity-80 transition-opacity group-hover:opacity-100" />
            <span className="leading-5 text-muted-foreground group-hover:text-foreground transition-colors">
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
