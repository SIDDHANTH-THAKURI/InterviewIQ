import WebSocket from "ws";
import { MIC_SAMPLE_RATE } from "../types/interview";

export interface STTHandlers {
  onOpen?: () => void;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onUtteranceEnd?: () => void;
  onError?: (message: string) => void;
}

/** Common shape implemented by both the Deepgram and ElevenLabs STT backends. */
export interface STTConnection {
  start(): void | Promise<void>;
  sendAudio(buf: Buffer): void;
  close(): void;
}

/**
 * Persistent Deepgram realtime connection. Streams raw 16-bit PCM in, emits
 * interim + final transcripts and an utterance-end signal that the orchestrator
 * uses to decide when the candidate has finished speaking.
 *
 * Uses nova-3 (best accuracy) and the candidate's ACTUAL mic sample rate so the
 * audio is never lossily resampled before it reaches Deepgram.
 */
export class DeepgramSTT {
  private ws: WebSocket | null = null;
  private keepAlive: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    private apiKey: string,
    private handlers: STTHandlers,
    private sampleRate: number = MIC_SAMPLE_RATE
  ) {}

  start() {
    const params = new URLSearchParams({
      model: "nova-3",
      language: "en-US",
      encoding: "linear16",
      sample_rate: String(this.sampleRate),
      channels: "1",
      interim_results: "true",
      endpointing: "500",
      utterance_end_ms: "1500",
      punctuate: "true",
      smart_format: "true",
      filler_words: "false",
    });
    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    const ws = new WebSocket(url, {
      headers: { Authorization: `Token ${this.apiKey}` },
    });
    this.ws = ws;

    ws.on("open", () => {
      this.handlers.onOpen?.();
      this.keepAlive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "KeepAlive" }));
        }
      }, 8000);
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "Results") {
          const alt = msg.channel?.alternatives?.[0];
          const transcript: string = alt?.transcript ?? "";
          if (!transcript) return;
          if (msg.is_final) {
            this.handlers.onFinal?.(transcript);
            if (msg.speech_final) this.handlers.onUtteranceEnd?.();
          } else {
            this.handlers.onInterim?.(transcript);
          }
        } else if (msg.type === "UtteranceEnd") {
          this.handlers.onUtteranceEnd?.();
        }
      } catch {
        /* ignore non-JSON keepalive responses */
      }
    });

    ws.on("error", (err) => {
      if (!this.closed) this.handlers.onError?.((err as Error).message);
    });

    ws.on("close", () => {
      if (this.keepAlive) clearInterval(this.keepAlive);
      this.keepAlive = null;
    });
  }

  sendAudio(buf: Buffer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(buf);
    }
  }

  close() {
    this.closed = true;
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
      } catch {
        /* noop */
      }
    }
    this.ws?.close();
    this.ws = null;
  }
}
