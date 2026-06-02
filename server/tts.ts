import WebSocket from "ws";
import { TTS_SAMPLE_RATE } from "../types/interview";

export interface TTSHandlers {
  /** Raw PCM (16-bit LE @ 24 kHz) audio chunk. */
  onAudio: (buf: Buffer) => void;
  /** Fired once when the first audio chunk arrives. */
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

/**
 * A single streaming utterance. Open it, feed text incrementally with
 * `sendText`, call `endInput()` when the source text is complete, and await
 * `done`. Audio is emitted to `onAudio` as ElevenLabs generates it.
 */
export class TTSSession {
  private ws: WebSocket;
  private open = false;
  private ended = false;
  private startedAudio = false;
  private queue: string[] = [];
  private settled = false;

  readonly done: Promise<void>;
  private resolveDone!: () => void;

  constructor(apiKey: string, voiceId: string, handlers: TTSHandlers) {
    this.done = new Promise<void>((resolve) => {
      this.resolveDone = resolve;
    });

    const url =
      `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input` +
      `?model_id=eleven_turbo_v2&output_format=pcm_${TTS_SAMPLE_RATE}`;
    this.ws = new WebSocket(url, { headers: { "xi-api-key": apiKey } });

    this.ws.on("open", () => {
      this.open = true;
      this.send({
        text: " ",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
        generation_config: { chunk_length_schedule: [50, 120, 180, 260] },
      });
      for (const t of this.queue) this.send({ text: t });
      this.queue = [];
      if (this.ended) this.send({ text: "" });
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.audio) {
          const buf = Buffer.from(msg.audio as string, "base64");
          if (!this.startedAudio) {
            this.startedAudio = true;
            handlers.onStart?.();
          }
          handlers.onAudio(buf);
        }
        if (msg.isFinal) {
          handlers.onEnd?.();
          this.settle();
          try {
            this.ws.close();
          } catch {
            /* noop */
          }
        }
      } catch {
        /* ignore */
      }
    });

    this.ws.on("error", (err) => {
      handlers.onError?.((err as Error).message);
      this.settle();
    });

    this.ws.on("close", () => {
      if (this.startedAudio) handlers.onEnd?.();
      this.settle();
    });
  }

  private send(obj: unknown) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private settle() {
    if (this.settled) return;
    this.settled = true;
    this.resolveDone();
  }

  /** Feed a chunk of text (should end with whitespace for clean phrasing). */
  sendText(text: string) {
    if (!text) return;
    if (this.open) this.send({ text });
    else this.queue.push(text);
  }

  /** Signal that no more text is coming. */
  endInput() {
    this.ended = true;
    if (this.open) this.send({ text: "" });
  }

  abort() {
    try {
      this.ws.close();
    } catch {
      /* noop */
    }
    this.settle();
  }
}

export class ElevenLabsTTS {
  constructor(
    private apiKey: string,
    private voiceId: string
  ) {}

  createSession(handlers: TTSHandlers): TTSSession {
    return new TTSSession(this.apiKey, this.voiceId, handlers);
  }
}
