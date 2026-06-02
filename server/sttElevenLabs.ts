import WebSocket from "ws";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { STTHandlers } from "./stt";

const SUPPORTED_RATES = [8000, 16000, 22050, 24000, 44100, 48000];

/**
 * Mints a single-use token for the realtime Scribe endpoint. Throws if the API
 * key lacks the `speech_to_text` permission (which is the common gotcha — enable
 * it on the key in the ElevenLabs dashboard).
 */
export async function mintScribeToken(apiKey: string): Promise<string> {
  const client = new ElevenLabsClient({ apiKey });
  const r: unknown = await client.tokens.singleUse.create("realtime_scribe");
  if (typeof r === "string") return r;
  const obj = r as Record<string, unknown>;
  const token = obj.token ?? obj.value ?? obj.single_use_token ?? obj.singleUseToken;
  if (typeof token !== "string") throw new Error("Unexpected token response shape");
  return token;
}

/**
 * ElevenLabs Scribe v2 Realtime STT. Streams PCM (base64) in, emits partial +
 * committed transcripts. Reconnects automatically (single-use tokens + any
 * session time limit), so it survives a full interview.
 */
export class ElevenLabsSTT {
  private ws: WebSocket | null = null;
  private closed = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private rate: number;
  private audioFormat: string;
  private firstToken: string | null;

  constructor(
    private mint: () => Promise<string>,
    private handlers: STTHandlers,
    sampleRate: number,
    initialToken?: string
  ) {
    this.rate = SUPPORTED_RATES.includes(sampleRate) ? sampleRate : 48000;
    this.audioFormat = `pcm_${this.rate}`;
    this.firstToken = initialToken ?? null;
  }

  async start() {
    await this.connect();
  }

  private async connect() {
    if (this.closed) return;
    let token: string;
    try {
      token = this.firstToken ?? (await this.mint());
      this.firstToken = null;
    } catch (err) {
      this.handlers.onError?.("token: " + (err as Error).message);
      throw err;
    }

    const params = new URLSearchParams({
      model_id: "scribe_v2_realtime",
      commit_strategy: "vad",
      audio_format: this.audioFormat,
      vad_silence_threshold_secs: "1.2",
      token,
    });
    const ws = new WebSocket(
      `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`
    );
    this.ws = ws;

    ws.on("open", () => this.handlers.onOpen?.());
    ws.on("message", (d) => {
      try {
        const m = JSON.parse(d.toString());
        switch (m.message_type) {
          case "partial_transcript":
            if (m.text) this.handlers.onInterim?.(m.text);
            break;
          case "committed_transcript":
          case "committed_transcript_with_timestamps":
            if (m.text) {
              this.handlers.onFinal?.(m.text);
              this.handlers.onUtteranceEnd?.();
            }
            break;
          case "error":
          case "auth_error":
          case "quota_exceeded":
            this.handlers.onError?.(m.error || m.message_type);
            break;
          default:
            break;
        }
      } catch {
        /* ignore */
      }
    });
    ws.on("error", (e) => {
      if (!this.closed) this.handlers.onError?.((e as Error).message);
    });
    ws.on("close", () => {
      // Reconnect (session time limit / transient drop) with a fresh token.
      if (!this.closed) {
        this.reconnectTimer = setTimeout(() => void this.connect().catch(() => {}), 400);
      }
    });
  }

  sendAudio(buf: Buffer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: buf.toString("base64"),
          sample_rate: this.rate,
        })
      );
    }
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
    this.ws = null;
  }
}
