/**
 * src/features/chat/VoiceMode.tsx
 *
 * Real voice overlay — uses the Web Speech API via WebSpeechProvider.
 * Shows an animated waveform that responds to real microphone volume.
 *
 * States: idle → listening → speaking → listening (loop)
 * Supports barge-in (user speaks while agent is talking).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, MicOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WebSpeechProvider } from "@/lib/voice/WebSpeechProvider";
import { usePilotStore } from "@/store/pilotStore";
import type { RunSessionHandle } from "@/hooks/useRunSession";

interface VoiceModeProps {
  session: RunSessionHandle | null;
  onClose: () => void;
}

const BAR_COUNT = 24;

export function VoiceMode({ session, onClose }: VoiceModeProps) {
  const providerRef = useRef<WebSpeechProvider | null>(null);
  const [phase, setPhase] = useState<"listening" | "speaking" | "thinking">("listening");
  const [transcript, setTranscript] = useState("");
  const [agentText, setAgentText] = useState("");
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(0.1));
  const [isSupported, setIsSupported] = useState(true);
  const voiceState = usePilotStore((s) => s.voiceState);
  const setVoiceState = usePilotStore((s) => s.setVoiceState);

  const startListening = useCallback(() => {
    const p = providerRef.current;
    if (!p) return;
    setPhase("listening");
    setVoiceState("listening");
    void p.startListening({ continuous: true, interimResults: true });
  }, [setVoiceState]);

  const stopAndSend = useCallback(
    async (text: string) => {
      const p = providerRef.current;
      if (!p || !text.trim()) return;
      p.stopListening();
      setPhase("thinking");
      setVoiceState("thinking");
      setTranscript("");
      if (session) {
        await session.send(text.trim());
      }
      // After sending, switch back to listening
      setTimeout(() => startListening(), 500);
    },
    [session, setVoiceState, startListening]
  );

  // Init provider
  useEffect(() => {
    if (!WebSpeechProvider.isSupported()) {
      setIsSupported(false);
      return;
    }
    const p = new WebSpeechProvider();

    p.onTranscript = (text, isFinal) => {
      setTranscript(text);
      if (isFinal) {
        void stopAndSend(text);
      }
    };

    p.onVolumeLevel = (level) => {
      setBars((prev) =>
        prev.map((_, i) => {
          const base = 0.05 + Math.sin(Date.now() / 300 + i) * 0.05;
          return Math.max(0.05, Math.min(1, level * (0.5 + Math.random() * 0.5) + base));
        })
      );
    };

    p.onError = (err) => console.warn("Voice error:", err);
    p.onSpeakStart = () => { setPhase("speaking"); setVoiceState("speaking"); };
    p.onSpeakEnd = () => startListening();

    providerRef.current = p;
    void p.startListening({ continuous: true, interimResults: true });
    setVoiceState("listening");
    setPhase("listening");

    return () => {
      p.destroy();
      setVoiceState("idle");
    };
  }, [setVoiceState, startListening, stopAndSend]);

  // Narrate agent messages
  const messages = usePilotStore((s) => s.serverMessages);
  const lastAssistantRef = useRef("");
  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant" && m.text.length > 4);
    if (!last || last.text === lastAssistantRef.current) return;
    lastAssistantRef.current = last.text;
    const p = providerRef.current;
    if (p && phase !== "speaking") {
      p.stopListening();
      setAgentText(last.text.slice(0, 200));
      void p.speak(last.text.slice(0, 600));
    }
  }, [messages, phase]);

  // Idle waveform animation
  useEffect(() => {
    if (phase !== "listening") return;
    const id = setInterval(() => {
      setBars((prev) => prev.map((_, i) => 0.06 + Math.abs(Math.sin(Date.now() / 500 + i * 0.4)) * 0.12));
    }, 80);
    return () => clearInterval(id);
  }, [phase]);

  const barColor =
    phase === "listening" ? "var(--agent)" :
    phase === "speaking"  ? "oklch(0.65 0.17 150)" :
    "oklch(0.65 0.15 60)";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-xl"
        aria-label="Voice mode"
        role="dialog"
        aria-modal="true"
      >
        {/* Close */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 text-muted-foreground"
          onClick={() => { providerRef.current?.destroy(); onClose(); }}
          aria-label="Close voice mode"
        >
          <X className="size-5" />
        </Button>

        {!isSupported ? (
          <div className="text-center px-8">
            <MicOff className="mx-auto size-12 text-muted-foreground/40 mb-4" />
            <p className="text-sm font-medium text-foreground">Voice not supported</p>
            <p className="text-xs text-muted-foreground mt-2">
              Please use Chrome or Edge for Web Speech API support.
            </p>
          </div>
        ) : (
          <>
            {/* Status label */}
            <motion.div
              key={phase}
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="mb-8 flex items-center gap-2"
            >
              <span className="live-dot" />
              <span className="text-sm font-semibold text-foreground capitalize">
                {phase === "listening" ? "Listening…" : phase === "speaking" ? "Speaking…" : "Thinking…"}
              </span>
            </motion.div>

            {/* Waveform */}
            <div
              className="flex items-center gap-[3px] h-24"
              aria-hidden="true"
              style={{ width: BAR_COUNT * 11 }}
            >
              {bars.map((h, i) => (
                <motion.div
                  key={i}
                  animate={{ scaleY: h }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  style={{
                    width: 7,
                    borderRadius: 4,
                    background: barColor,
                    height: "100%",
                    transformOrigin: "center",
                    opacity: 0.7 + h * 0.3,
                  }}
                />
              ))}
            </div>

            {/* Transcript / agent text */}
            <div className="mt-8 min-h-[48px] max-w-sm px-4 text-center">
              {phase === "speaking" && agentText ? (
                <p className="text-sm text-muted-foreground leading-relaxed">{agentText}</p>
              ) : transcript ? (
                <p className="text-base font-medium text-foreground">{transcript}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Say something…</p>
              )}
            </div>

            {/* Barge-in / mute */}
            <div className="mt-8 flex gap-3">
              {phase === "speaking" ? (
                <Button
                  id="barge-in-btn"
                  variant="outline"
                  className="gap-2"
                  onClick={() => providerRef.current?.bargeIn()}
                >
                  <Mic className="size-4" />
                  Interrupt
                </Button>
              ) : (
                <Button
                  id="voice-stop-btn"
                  variant="outline"
                  className="gap-2"
                  onClick={() => { providerRef.current?.stopListening(); onClose(); }}
                >
                  <MicOff className="size-4" />
                  Stop
                </Button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
