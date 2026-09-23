import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePilotStore } from "@/store/pilotStore";
import { ResultCard } from "./ResultCards";
import type { ChatMessage } from "@/types/pilot";

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[78%] rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-6 text-white"
        style={{
          background: "linear-gradient(135deg, oklch(0.55 0.22 264), oklch(0.45 0.2 280))",
          boxShadow: "0 2px 8px oklch(0.55 0.22 264 / 30%)",
        }}
      >
        {message.text}
      </div>
    </div>
  );
}

function AssistantBubble({ message }: { message: ChatMessage }) {
  const isStreaming = message.text === "" ;
  return (
    <div className="flex flex-col gap-3">
      {/* Unboxed assistant text */}
      {isStreaming ? (
        <div className="flex items-center gap-2 py-1">
          <div className="flex gap-1" aria-label="Pilot is thinking">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="inline-block size-1.5 rounded-full bg-muted-foreground"
                animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm leading-7 text-foreground whitespace-pre-wrap">{message.text}</p>
      )}
      {/* Inline result card */}
      {message.result && (
        <motion.div
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 140, damping: 20 }}
        >
          <ResultCard kind={message.result} />
        </motion.div>
      )}
    </div>
  );
}

export function Transcript({ threadId }: { threadId: string }) {
  const threads = usePilotStore((s) => s.threads);
  const thread = threads.find((t) => t.id === threadId);
  const messages = thread?.messages ?? [];
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, messages.at(-1)?.text]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-2 pt-4" role="log" aria-live="polite" aria-label="Conversation">
      <AnimatePresence initial={false}>
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.22 }}
            className="mb-5"
          >
            {msg.role === "user" ? (
              <UserBubble message={msg} />
            ) : (
              <AssistantBubble message={msg} />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  );
}
