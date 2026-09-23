import { motion } from "framer-motion";
import { Plane, Pizza, Laptop, MessageSquare } from "lucide-react";

const suggestions = [
  { id: "flight", icon: Plane, label: "Book a flight to Dubai", prompt: "Book me a flight from New York to Dubai" },
  { id: "food", icon: Pizza, label: "Order a margherita pizza", prompt: "Order a margherita pizza from a nearby place" },
  { id: "products", icon: Laptop, label: "Compare laptops under $1,000", prompt: "Compare the best laptops under $1000 for work and travel" },
  { id: "chat", icon: MessageSquare, label: "Just have a conversation", prompt: "Hey, what can you help me with?" },
];

interface EmptyGreetingProps {
  onPrompt: (text: string) => void;
}

export function EmptyGreeting({ onPrompt }: EmptyGreetingProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      {/* Identity orb */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
        className="relative mb-8"
      >
        <div
          className="size-20 rounded-full bg-agent-soft border border-agent/30 flex items-center justify-center"
          style={{
            boxShadow: "0 0 48px oklch(0.68 0.2 264 / 30%), 0 0 0 12px oklch(0.68 0.2 264 / 8%)",
          }}
        >
          {/* Pilot "P" wordmark glyph */}
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <circle cx="18" cy="18" r="17" stroke="currentColor" strokeWidth="1.5" className="text-agent" opacity="0.4" />
            <path
              d="M13 10h7a5 5 0 0 1 0 10h-5v6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-agent"
            />
          </svg>
        </div>
        {/* Animated ring */}
        <motion.div
          animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0.1, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 rounded-full bg-agent"
          style={{ filter: "blur(16px)" }}
        />
      </motion.div>

      <motion.h1
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="text-2xl font-semibold tracking-tight"
      >
        What can Pilot help with?
      </motion.h1>
      <motion.p
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="mt-2 max-w-sm text-sm text-muted-foreground"
      >
        Chat freely, or ask me to handle a browser task. I'll show you exactly what I'm doing.
      </motion.p>

      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.22, duration: 0.4 }}
        className="mt-8 grid w-full max-w-lg grid-cols-2 gap-2.5"
      >
        {suggestions.map(({ id, icon: Icon, label, prompt }) => (
          <button
            key={id}
            id={`suggestion-${id}`}
            onClick={() => onPrompt(prompt)}
            className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left text-sm font-medium transition-all duration-150 hover:border-agent/50 hover:bg-accent hover:shadow-md active:scale-[0.98]"
          >
            <span className="grid size-8 flex-shrink-0 place-items-center rounded-xl bg-agent-soft text-agent transition-colors group-hover:bg-agent group-hover:text-white">
              <Icon className="size-4" />
            </span>
            <span className="leading-tight text-foreground">{label}</span>
          </button>
        ))}
      </motion.div>
    </div>
  );
}
