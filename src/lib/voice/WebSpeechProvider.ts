/**
 * src/lib/voice/WebSpeechProvider.ts
 *
 * Real browser Speech-to-Text + Text-to-Speech using the Web Speech API.
 * Falls back gracefully when the API is unavailable.
 *
 * STT: SpeechRecognition (continuous, interim results)
 * TTS: SpeechSynthesis (system voices)
 *
 * Usage:
 *   const voice = new WebSpeechProvider();
 *   voice.onTranscript = (text, isFinal) => ...
 *   voice.onVolumeLevel = (0-1) => ...
 *   await voice.startListening();
 *   await voice.stopListening();
 *   await voice.speak("Hello! I've completed the task.");
 */

export interface VoiceProviderOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

export class WebSpeechProvider {
  private recognition: any = null;
  private synthesis: SpeechSynthesis | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private volumeTimer: ReturnType<typeof setInterval> | null = null;
  private _isSpeaking = false;
  private _isListening = false;

  // Callbacks — set these before calling start
  onTranscript: ((text: string, isFinal: boolean) => void) | null = null;
  onVolumeLevel: ((level: number) => void) | null = null;
  onError: ((err: string) => void) | null = null;
  onSpeakStart: (() => void) | null = null;
  onSpeakEnd: (() => void) | null = null;

  get isListening() { return this._isListening; }
  get isSpeaking() { return this._isSpeaking; }

  static isSupported(): boolean {
    return (
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) &&
      "speechSynthesis" in window
    );
  }

  async startListening(opts: VoiceProviderOptions = {}): Promise<void> {
    if (this._isListening) return;

    // SpeechRecognition
    const SR = (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition })["SpeechRecognition"] ??
               (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition })["webkitSpeechRecognition"];
    if (!SR) {
      this.onError?.("Speech recognition not supported in this browser.");
      return;
    }

    this.recognition = new SR();
    this.recognition.lang = opts.language ?? navigator.language ?? "en-US";
    this.recognition.continuous = opts.continuous ?? true;
    this.recognition.interimResults = opts.interimResults ?? true;

    this.recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result != null) {
          const transcript = result[0]?.transcript ?? "";
          if (result.isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }
      }
      if (final) this.onTranscript?.(final.trim(), true);
      else if (interim) this.onTranscript?.(interim.trim(), false);
    };

    this.recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        this.onError?.(`Speech recognition error: ${e.error}`);
      }
    };

    this.recognition.onend = () => {
      // Auto-restart if still listening (browser may stop after silence)
      if (this._isListening && this.recognition) {
        try { this.recognition.start(); } catch { /* ignore already-started */ }
      }
    };

    this.recognition.start();
    this._isListening = true;

    // Microphone volume analyser
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioCtx = new AudioContext();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      const source = this.audioCtx.createMediaStreamSource(this.micStream);
      source.connect(this.analyser);

      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.volumeTimer = setInterval(() => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        this.onVolumeLevel?.(Math.min(1, avg / 100));
      }, 50);
    } catch {
      // Mic access denied — continue without volume meter
    }
  }

  stopListening(): void {
    this._isListening = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* ignore */ }
      this.recognition = null;
    }
    if (this.volumeTimer) {
      clearInterval(this.volumeTimer);
      this.volumeTimer = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
    this.analyser = null;
    this.onVolumeLevel?.(0);
  }

  async speak(text: string, lang?: string): Promise<void> {
    if (!("speechSynthesis" in window)) return;
    this.synthesis = window.speechSynthesis;

    // Cancel any ongoing speech (barge-in)
    this.synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang ?? navigator.language ?? "en-US";
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Prefer a natural-sounding voice
    const voices = this.synthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith(utterance.lang.split("-")[0] ?? "en") &&
        (v.name.includes("Natural") || v.name.includes("Neural") || v.name.includes("Enhanced"))
    ) ?? voices.find((v) => v.lang.startsWith("en")) ?? voices[0];
    if (preferred) utterance.voice = preferred;

    return new Promise<void>((resolve) => {
      utterance.onstart = () => {
        this._isSpeaking = true;
        this.onSpeakStart?.();
      };
      utterance.onend = () => {
        this._isSpeaking = false;
        this.onSpeakEnd?.();
        resolve();
      };
      utterance.onerror = () => {
        this._isSpeaking = false;
        this.onSpeakEnd?.();
        resolve();
      };
      this.synthesis!.speak(utterance);
    });
  }

  bargeIn(): void {
    if (this._isSpeaking) {
      window.speechSynthesis.cancel();
      this._isSpeaking = false;
      this.onSpeakEnd?.();
    }
  }

  destroy(): void {
    this.stopListening();
    this.bargeIn();
  }
}
