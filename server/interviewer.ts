/**
 * One live interview session: listens (Deepgram), thinks (Claude), speaks
 * (ElevenLabs), keeps time, and produces the scored report at the end.
 */
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, FALLBACK_BETA, MODELS } from "../lib/ai/claude";
import {
  buildInterviewerPrompt,
  COMPLETE_TOKEN,
  MOVE_ON_NOTE,
  OPENING_NOTE,
  parsePanelSegments,
  pickInterviewers,
  REASSURANCES,
  RESUME_NOTE,
  SKIP_NOTE,
  voiceFor,
  WRAP_NOTE,
} from "../lib/ai/interviewer";
import { computeDelivery } from "../lib/ai/delivery";
import { generateFeedback } from "../lib/ai/feedback";
import { coachHint } from "../lib/ai/prep";
import { claudeCost, sttCost, ttsCost } from "../lib/server/pricing";
import { recordUsage, remainingMinutes, type Member } from "../lib/server/access";
import type { ProviderKeys } from "../lib/server/keys";
import { DeepgramSTT, type STTHandlers } from "./stt";
import { ElevenLabsTTS, type TTSSession } from "./tts";
import { analyzeFrame } from "./vision";
import type {
  ClientStartMessage,
  CvMetrics,
  InterviewConfig,
  InterviewContext,
  InterviewerInfo,
  ServerMessage,
  TranscriptTurn,
  VisionAnalysis,
} from "../types/interview";

/** Silence after the candidate's last words before we treat the answer as finished. */
const TURN_SETTLE_MS = Number(process.env.TURN_SETTLE_MS) || 3500;
const NUDGE1_MS = 16000;
const NUDGE2_MS = 14000;
const MAX_CONSECUTIVE_SILENT = 3;
/** Grace period past the planned duration before the session is closed regardless. */
const OVERTIME_MIN = 3;

type ChatTurn = { role: "user" | "assistant"; content: string; synthetic?: boolean };

export type Emit = (msg: ServerMessage) => void;
export type EmitAudio = (buf: Buffer) => void;

export class InterviewSession {
  /** null = bring-your-own-keys session (no owner limits, no owner usage). */
  private member: Member | null = null;
  private keys!: ProviderKeys;
  private config!: InterviewConfig;
  private context!: InterviewContext;
  private candidateName?: string;
  private interviewers: InterviewerInfo[] = [];
  private systemPrompt = "";
  private history: ChatTurn[] = [];
  private transcript: TranscriptTurn[] = [];
  private vision: VisionAnalysis[] = [];
  private cv: CvMetrics | null = null;

  private stt: DeepgramSTT | null = null;
  private tts: ElevenLabsTTS[] = [];
  private finalBuffer = "";
  private answerSpeakingSec = 0;
  private lastLine = "";

  private generating = false;
  private analyzing = false;
  private paused = false;
  private finished = false;
  private closed = false;
  private wrapping = false;
  private pendingArmSilence = false;
  private panelPlaybackResolver: (() => void) | null = null;

  private awaitingAnswer = false;
  private candidateSpoke = false;
  private silenceTimer: NodeJS.Timeout | null = null;
  private settleTimer: NodeJS.Timeout | null = null;
  private clock: NodeJS.Timeout | null = null;
  private consecutiveSilent = 0;
  private exchanges = 0;
  private hintsUsed = 0;

  private activeMs = 0;
  private maxMs = 0;
  private plannedMs = 0;
  private costUsd = 0;
  private ttsChars = 0;
  private usageRecorded = false;

  constructor(
    private emit: Emit,
    private emitAudio: EmitAudio
  ) {}

  /* ─────────────────────────────── lifecycle ──────────────────────────── */

  async start(payload: ClientStartMessage, { member, keys }: { member: Member | null; keys: ProviderKeys }) {
    this.member = member;
    this.keys = keys;
    this.config = payload.config;
    this.context = payload.context;
    this.candidateName = payload.candidateName?.slice(0, 60);

    const remaining = member ? remainingMinutes(member) : null;
    if (remaining !== null && remaining < 1) {
      this.emit({
        type: "error",
        fatal: true,
        code: "quota",
        message: "You've used all your practice minutes for this month. Ask the person who invited you for more.",
      });
      return;
    }
    const needed = [
      !keys.anthropic && "Anthropic",
      this.config.voiceOut && !keys.elevenlabs && "ElevenLabs",
      this.config.inputMode === "voice" && !keys.deepgram && "Deepgram",
    ].filter(Boolean);
    if (needed.length) {
      this.emit({
        type: "error",
        fatal: true,
        code: "keys",
        message: member
          ? `The server owner hasn't set up: ${needed.join(", ")}.`
          : `This session needs your ${needed.join(" and ")} key. Add it in Profile → Your keys, or switch to typing / captions.`,
      });
      return;
    }

    this.plannedMs = this.config.duration * 60_000;
    const capMin = Math.min(this.config.duration + OVERTIME_MIN, remaining ?? Infinity);
    this.maxMs = capMin * 60_000;
    this.plannedMs = Math.min(this.plannedMs, this.maxMs - 60_000);

    this.interviewers = pickInterviewers(payload.sessionId, this.config);
    this.systemPrompt = buildInterviewerPrompt({
      config: this.config,
      context: this.context,
      interviewers: this.interviewers,
      candidateName: this.candidateName,
    });

    if (this.config.voiceOut) {
      const key = keys.elevenlabs!;
      this.tts = this.interviewers.map((i, n) => new ElevenLabsTTS(key, voiceFor(i.gender, n), this.config.language));
    }

    if (this.config.inputMode === "voice") {
      const handlers: STTHandlers = {
        onInterim: (text) => {
          if (this.paused) return;
          this.candidateSpoke = true;
          this.consecutiveSilent = 0;
          this.clearSilence();
          this.clearSettle();
          this.emit({ type: "transcript:interim", text });
        },
        onFinal: (text, dur) => {
          if (this.paused) return;
          this.finalBuffer += (this.finalBuffer ? " " : "") + text;
          this.answerSpeakingSec += dur;
          this.emit({ type: "transcript:final", text });
          this.restartSettle();
        },
        onUtteranceEnd: () => this.restartSettle(),
        onError: (m) => console.warn("[stt]", m),
      };
      const rate = payload.audioSampleRate && payload.audioSampleRate >= 8000 ? Math.round(payload.audioSampleRate) : 48000;
      this.stt = new DeepgramSTT(keys.deepgram!, handlers, rate, this.config.language);
      this.stt.start();
    }

    this.emit({ type: "session:ready", interviewers: this.interviewers, maxMinutes: capMin });
    this.emit({ type: "status", state: "live" });
    this.startClock();

    this.history.push({ role: "user", content: OPENING_NOTE, synthetic: true });
    await this.runTurn();
  }

  handleAudio(buf: Buffer) {
    if (this.closed || this.paused) return;
    this.stt?.sendAudio(buf);
  }

  handleText(text: string) {
    if (this.closed || this.paused || this.finished) return;
    const clean = text.trim().slice(0, 4000);
    if (!clean) return;
    this.finalBuffer += (this.finalBuffer ? "\n" : "") + clean;
    this.maybeProcessTurn();
  }

  handleVisionFrame(base64: string) {
    if (this.closed || this.analyzing || this.paused || !this.config.camera) return;
    this.analyzing = true;
    analyzeFrame(this.keys.anthropic, base64)
      .then(({ analysis, costUsd }) => {
        this.costUsd += costUsd;
        if (analysis && !this.closed) {
          this.vision.push(analysis);
          this.emit({ type: "vision:analysis", analysis });
        }
      })
      .finally(() => {
        this.analyzing = false;
      });
  }

  handleCvMetrics(metrics: CvMetrics) {
    if (!this.closed) this.cv = metrics;
  }

  handlePlaybackComplete() {
    if (this.panelPlaybackResolver) {
      const resolve = this.panelPlaybackResolver;
      this.panelPlaybackResolver = null;
      resolve();
      return;
    }
    if (this.closed || this.generating) return;
    if (this.pendingArmSilence) {
      this.pendingArmSilence = false;
      this.armSilence();
    }
  }

  async handleControl(kind: "repeat" | "hint" | "skip" | "pause" | "resume") {
    if (this.closed || this.finished) return;
    switch (kind) {
      case "pause":
        if (this.paused) return;
        this.paused = true;
        this.clearSilence();
        this.clearSettle();
        this.emit({ type: "status", state: "paused" });
        return;
      case "resume":
        if (!this.paused) return;
        this.paused = false;
        this.emit({ type: "status", state: "live" });
        if (!this.generating) {
          this.history.push({ role: "user", content: RESUME_NOTE, synthetic: true });
          await this.runTurn();
        }
        return;
      case "repeat":
        if (this.generating || !this.lastLine) return;
        this.stopAwaiting();
        await this.speak(this.lastLine, this.interviewers[0].name, false);
        this.afterSpeech();
        return;
      case "skip":
        if (this.generating) return;
        this.stopAwaiting();
        this.finalBuffer = "";
        this.history.push({ role: "user", content: SKIP_NOTE, synthetic: true });
        await this.runTurn();
        return;
      case "hint": {
        if (!this.config.coach) return;
        this.hintsUsed++;
        const { hint, costUsd } = await coachHint({
          apiKey: this.keys.anthropic,
          question: this.lastLine,
          partialAnswer: this.finalBuffer,
          role: this.context.role,
          resumeText: this.context.resumeText,
        });
        this.costUsd += costUsd;
        if (hint && !this.closed) this.emit({ type: "coach:hint", text: hint });
        // Hints are private thinking time — don't nudge them while they read.
        if (this.awaitingAnswer && !this.candidateSpoke) this.armSilence();
        return;
      }
    }
  }

  end() {
    if (this.finished || this.closed) return;
    void this.finish();
  }

  dispose() {
    if (!this.closed) this.recordUsageOnce();
    this.closed = true;
    this.clearSilence();
    this.clearSettle();
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
    this.stt?.close();
    this.stt = null;
  }

  /* ─────────────────────────────── clock ──────────────────────────────── */

  private startClock() {
    let last = Date.now();
    this.clock = setInterval(() => {
      const now = Date.now();
      if (!this.paused) this.activeMs += now - last;
      last = now;
      if (this.finished || this.closed) return;
      if (this.activeMs >= this.maxMs) {
        void this.finish();
      } else if (this.activeMs >= this.plannedMs && !this.wrapping) {
        this.wrapping = true;
        this.emit({ type: "interview:wrapping" });
        if (!this.generating) {
          this.stopAwaiting();
          this.finalBuffer = "";
          this.history.push({ role: "user", content: WRAP_NOTE, synthetic: true });
          void this.runTurn();
        }
      }
    }, 1000);
  }

  /* ─────────────────────────────── turns ──────────────────────────────── */

  private maybeProcessTurn() {
    this.clearSettle();
    const answer = this.finalBuffer.trim();
    if (!answer || this.generating || this.closed || this.paused) return;
    this.finalBuffer = "";
    this.stopAwaiting();
    this.consecutiveSilent = 0;
    this.exchanges++;
    this.history.push({ role: "user", content: answer });
    this.transcript.push({
      role: "candidate",
      text: answer,
      ts: Date.now(),
      speakingSec: this.answerSpeakingSec || undefined,
    });
    this.answerSpeakingSec = 0;
    this.emit({ type: "candidate:committed", text: answer });
    if (this.wrapping) this.history.push({ role: "user", content: WRAP_NOTE, synthetic: true });
    void this.runTurn();
  }

  private restartSettle() {
    if (this.generating || this.closed) return;
    this.clearSettle();
    this.settleTimer = setTimeout(() => this.maybeProcessTurn(), TURN_SETTLE_MS);
  }

  private clearSettle() {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
  }

  private messages(): Anthropic.Beta.BetaMessageParam[] {
    return this.history.map((m) => ({ role: m.role, content: m.content }));
  }

  /** One interviewer turn: stream Claude → (TTS) → client. */
  private async runTurn() {
    if (this.closed || this.generating) return;
    this.generating = true;
    this.clearSilence();
    this.emit({ type: "ai:thinking" });

    const panel = this.interviewers.length > 1;
    const lead = this.interviewers[0];
    // Single interviewer + voice: pipe sentences into TTS as they stream for low latency.
    const live = !panel && this.config.voiceOut ? this.openTts(0, lead.name) : null;
    let full = "";
    let buffer = "";

    try {
      const stream = anthropic(this.keys.anthropic).beta.messages.stream({
        model: MODELS.interviewer,
        max_tokens: 1024,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        thinking: { type: "between_tools" },
        output_config: { effort: "low" },
        cache_control: { type: "ephemeral" },
        system: this.systemPrompt,
        messages: this.messages(),
      });
      stream.on("text", (delta: string) => {
        full += delta;
        if (!this.config.voiceOut && !panel) {
          const visible = stripToken(delta);
          if (visible) this.emit({ type: "interviewer:delta", text: visible });
        }
        if (live) {
          buffer += delta;
          const { send, keep } = flushable(buffer);
          if (send) {
            live.sendText(send);
            buffer = keep;
          }
        }
      });
      const msg = await stream.finalMessage();
      this.costUsd += claudeCost(msg.model || MODELS.interviewer, msg.usage);
    } catch (err) {
      live?.abort();
      this.generating = false;
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        this.emit({
          type: "error",
          fatal: true,
          code: "keys",
          message: this.member
            ? "The server's Anthropic key was rejected. Let the person who invited you know."
            : "Your Anthropic key was rejected. Check it in Profile → Your keys.",
        });
        return;
      }
      console.warn("[interviewer]", (err as Error).message);
      this.emit({ type: "error", message: "The interviewer lost their train of thought. Say something to continue." });
      this.pendingArmSilence = true;
      return;
    }

    const complete = full.includes(COMPLETE_TOKEN);
    const spoken = stripToken(full).trim();
    if (spoken) this.history.push({ role: "assistant", content: spoken });

    if (live) {
      const tail = stripToken(buffer).trim();
      if (tail) live.sendText(tail + " ");
      live.endInput();
      await live.done;
      this.ttsChars += live.chars;
      if (spoken) this.commitLine(spoken, lead.name);
      this.emit({ type: "avatar:speaking:end" });
    } else if (panel) {
      const segments = parsePanelSegments(spoken, this.interviewers.map((i) => i.name));
      for (let i = 0; i < segments.length; i++) {
        if (this.closed) break;
        const seg = segments[i];
        await this.speak(seg.text, seg.name, true);
        if (i < segments.length - 1 && this.config.voiceOut && !this.closed) await this.waitForPlayback();
      }
    } else if (spoken) {
      this.commitLine(spoken, lead.name);
    }

    this.generating = false;
    if (complete || (this.wrapping && this.activeMs >= this.plannedMs + 90_000)) {
      await this.finish();
      return;
    }
    this.afterSpeech();
  }

  /** Speak a fixed line (or one panel segment) and record it. */
  private async speak(text: string, speaker: string, record: boolean) {
    const index = Math.max(0, this.interviewers.findIndex((i) => i.name === speaker));
    if (this.config.voiceOut) {
      const tts = this.openTts(index, speaker);
      tts.sendText(text + " ");
      tts.endInput();
      await tts.done;
      this.ttsChars += tts.chars;
      this.emit({ type: "avatar:speaking:end" });
    }
    if (record) this.commitLine(text, speaker);
    else this.emit({ type: "interviewer:line", text, speaker });
  }

  private openTts(index: number, speaker: string): TTSSession {
    const engine = this.tts[index] ?? this.tts[0];
    return engine.createSession({
      onStart: () => this.emit({ type: "avatar:speaking:start", speaker }),
      onAudio: (buf) => this.emitAudio(buf),
      onError: (m) => console.warn("[tts]", m),
    });
  }

  private commitLine(text: string, speaker: string) {
    this.lastLine = text;
    this.transcript.push({ role: "interviewer", text, ts: Date.now(), speaker });
    this.emit({ type: "interviewer:line", text, speaker });
  }

  private afterSpeech() {
    if (this.finalBuffer.trim()) {
      this.restartSettle();
      return;
    }
    if (this.config.voiceOut) this.pendingArmSilence = true;
    else this.armSilence();
  }

  private waitForPlayback(timeoutMs = 20000): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.panelPlaybackResolver = null;
        resolve();
      }, timeoutMs);
      this.panelPlaybackResolver = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  /* ───────────────────────── silence handling ─────────────────────────── */

  private armSilence() {
    this.clearSilence();
    if (this.closed || this.paused) return;
    this.awaitingAnswer = true;
    this.candidateSpoke = false;
    // Typed answers take longer and the persona "silent" is meant to wait.
    if (this.config.inputMode === "text" || this.config.persona === "silent") return;
    if (this.consecutiveSilent >= MAX_CONSECUTIVE_SILENT) return;
    const first = this.config.difficulty === "gentle" ? NUDGE1_MS + 8000 : NUDGE1_MS;
    this.silenceTimer = setTimeout(() => void this.nudge(1), first);
  }

  private async nudge(level: number) {
    if (!this.awaitingAnswer || this.generating || this.closed || this.candidateSpoke || this.paused) return;
    this.consecutiveSilent++;
    if (level === 1) {
      this.generating = true;
      await this.speak(REASSURANCES[Math.floor(Math.random() * REASSURANCES.length)], this.interviewers[0].name, false);
      this.generating = false;
      if (this.finalBuffer.trim()) return this.restartSettle();
      this.awaitingAnswer = true;
      this.silenceTimer = setTimeout(() => void this.nudge(2), NUDGE2_MS);
      return;
    }
    this.stopAwaiting();
    this.history.push({ role: "user", content: MOVE_ON_NOTE, synthetic: true });
    await this.runTurn();
  }

  private clearSilence() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
  }

  private stopAwaiting() {
    this.awaitingAnswer = false;
    this.clearSilence();
  }

  /* ────────────────────────────── finish ──────────────────────────────── */

  private async finish() {
    if (this.finished) return;
    this.finished = true;
    this.stopAwaiting();
    this.clearSettle();
    // Any words still buffered count as the last answer.
    const leftover = this.finalBuffer.trim();
    if (leftover) {
      this.transcript.push({ role: "candidate", text: leftover, ts: Date.now(), speakingSec: this.answerSpeakingSec || undefined });
      this.finalBuffer = "";
    }
    this.stt?.close();
    this.stt = null;
    this.emit({ type: "status", state: "closing" });
    this.emit({ type: "ai:thinking" });

    const delivery = computeDelivery(this.transcript, this.hintsUsed);
    const { feedback, costUsd } = await generateFeedback({
      apiKey: this.keys.anthropic,
      transcript: this.transcript,
      config: this.config,
      context: this.context,
      vision: this.vision,
      cv: this.config.camera ? this.cv : null,
      delivery,
      candidateName: this.candidateName,
    });
    this.costUsd += costUsd;
    this.recordUsageOnce();
    this.emit({ type: "interview:complete", feedback, transcript: this.transcript });
    this.dispose();
  }

  private recordUsageOnce() {
    if (this.usageRecorded || !this.member) return;
    this.usageRecorded = true;
    const minutes = this.activeMs / 60_000;
    if (minutes < 0.05 && this.costUsd === 0) return;
    const stt = this.config.inputMode === "voice" ? sttCost(minutes) : 0;
    recordUsage(this.member.id, {
      minutes,
      sessions: 1,
      costUsd: this.costUsd + ttsCost(this.ttsChars) + stt,
    });
  }
}

/* ─────────────────────────── text helpers ───────────────────────────────── */

function stripToken(s: string): string {
  return s.split(COMPLETE_TOKEN).join("").replace(/\[INTERVIEW_COMPLETE\]?$/, "");
}

/**
 * Pulls complete sentences out of a streaming buffer to feed TTS, holding back
 * anything that could be the start of the completion token.
 */
function flushable(buf: string): { send: string; keep: string } {
  let safeEnd = buf.length;
  const lastBracket = buf.lastIndexOf("[");
  if (lastBracket !== -1) {
    const tail = buf.slice(lastBracket);
    if (COMPLETE_TOKEN.startsWith(tail) || tail.startsWith(COMPLETE_TOKEN)) safeEnd = lastBracket;
  }
  const safe = buf.slice(0, safeEnd);
  const m = safe.match(/^[\s\S]*?[.?!…।]["')\]]?\s/);
  if (m) return { send: stripToken(buf.slice(0, m[0].length)), keep: buf.slice(m[0].length) };
  return { send: "", keep: buf };
}
