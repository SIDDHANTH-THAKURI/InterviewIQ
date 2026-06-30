import {
  getAnthropic,
  BRAIN_MODEL,
  FEEDBACK_MODEL,
  FEEDBACK_SYSTEM_PROMPT,
  buildSystemPrompt,
  buildPanelSystemPrompt,
  buildFeedbackUserPrompt,
  pickInterviewer,
  pickTwoInterviewers,
  getVoiceId,
  getSecondaryVoiceId,
  guessJobTitle,
  formatVisionContext,
  extractJson,
  makePanelOpeningInstruction,
  makePanelMoveonInstruction,
  type Interviewer,
  type Gender,
} from "../lib/claude";
import { DeepgramSTT, type STTConnection, type STTHandlers } from "./stt";
import { ElevenLabsSTT, mintScribeToken } from "./sttElevenLabs";
import { ElevenLabsTTS } from "./tts";
import { analyzeFrame } from "./vision";
import { saveSessionSnapshot } from "../lib/supabase";
import {
  AUTOSAVE_INTERVAL_MS,
  MIC_SAMPLE_RATE,
  type ClientStartMessage,
  type CvMetrics,
  type InterviewConfig,
  type InterviewDocuments,
  type InterviewFeedback,
  type Presence,
  type ServerMessage,
  type SessionKeys,
  type TranscriptTurn,
  type VisionAnalysis,
} from "../types/interview";

const COMPLETE_TOKEN = "[INTERVIEW_COMPLETE]";

const OPENING_INSTRUCTION =
  "[The interview is beginning. The candidate has just joined the call. Start with a warm, natural introduction: greet them, introduce yourself by name, and ask a short icebreaker (how are they, are they ready, etc.). Do NOT jump straight into interview questions yet — just make them comfortable first. Keep it conversational and brief.]";

const MOVEON_INSTRUCTION =
  "[The candidate has gone quiet and may be stuck or unsure. Warmly reassure them that it's completely okay, then either rephrase your previous question more simply or move on to a different, easier one. Keep it short and kind.]";

const REASSURANCES = [
  "Take your time.",
  "No rush — whenever you're ready.",
  "It's alright, take a moment to think it through.",
  "Whenever you're ready, go ahead.",
];

const ABSENT_LINES = [
  "I can't see you anymore — are you still there?",
  "Looks like you stepped away. Take your time, I'm here when you're back.",
];

// How long the candidate must be silent AFTER speaking before we treat their
// answer as finished and reply. This is the "let me finish" buffer — bump it
// up if you want even more room (the user asked for ~5s).
const TURN_SETTLE_MS = 4000;

// Silence handling thresholds (ms) — these are for when the candidate hasn't
// started answering at all (kept patient so it doesn't feel rushed).
const NUDGE1_MS = 15000;
const NUDGE2_MS = 13000;
const NUDGE1_MS_SILENT = 26000; // the "silent" personality waits much longer
const REACT_COOLDOWN_MS = 18000;
const MAX_CONSECUTIVE_SILENT = 4;

type ChatTurn = { role: "user" | "assistant"; content: string; synthetic?: boolean };

export type Emit = (msg: ServerMessage) => void;
export type EmitAudio = (buf: Buffer) => void;

export class InterviewOrchestrator {
  private sessionId = "";
  private documents: InterviewDocuments = {
    resumeText: "",
    coverLetterText: "",
    jobDescription: "",
  };
  private config: InterviewConfig = {
    type: "mixed",
    difficulty: "mid",
    duration: 20,
    personality: "neutral",
    mode: "standard",
  };

  private interviewerName = "Your interviewer";
  private gender: Gender = "female";
  private voiceId = "";
  private secondaryVoiceId = "";
  private panelInterviewers: [Interviewer, Interviewer] | null = null;
  private sampleRate = MIC_SAMPLE_RATE;
  private systemPrompt = "";
  private history: ChatTurn[] = [];
  private finalBuffer = "";
  private latestVision: VisionAnalysis | null = null;
  private visionHistory: VisionAnalysis[] = [];
  private cvMetrics: CvMetrics | null = null;

  private stt: STTConnection | null = null;
  private tts: ElevenLabsTTS | null = null;
  private tts2: ElevenLabsTTS | null = null; // panel secondary voice
  private autosave: NodeJS.Timeout | null = null;

  private sessionKeys: SessionKeys = {};
  private generating = false;
  private panelPlaybackResolver: (() => void) | null = null;
  private analyzing = false;
  private finished = false;
  private closed = false;
  private pendingArmSilence = false;

  // Silence / presence tracking
  private awaitingAnswer = false;
  private candidateSpoke = false;
  private silenceTimer: NodeJS.Timeout | null = null;
  private settleTimer: NodeJS.Timeout | null = null;
  private consecutiveSilent = 0;
  private exchangeCount = 0;
  private minExchanges = 3;
  private lastPresence: Presence = "present";
  private lastReactionAt = 0;

  constructor(
    private emit: Emit,
    private emitAudio: EmitAudio
  ) {}

  /* ─────────────────────────────── lifecycle ──────────────────────────── */

  async start(payload: ClientStartMessage) {
    this.sessionId = payload.sessionId;
    this.documents = {
      resumeText: payload.resumeText,
      coverLetterText: payload.coverLetterText,
      jobDescription: payload.jobDescription,
    };
    this.config = payload.config;
    this.sessionKeys = payload.apiKeys ?? {};
    this.minExchanges = Math.max(3, Math.round(this.config.duration / 3));
    if (payload.audioSampleRate && payload.audioSampleRate >= 8000) {
      this.sampleRate = Math.round(payload.audioSampleRate);
    }

    const missing = this.missingKeys();
    if (missing.length) {
      this.emit({
        type: "error",
        fatal: true,
        message: `The realtime server is missing API keys: ${missing.join(", ")}. Add them to .env.local and restart.`,
      });
      return;
    }

    const elKey = this.sessionKeys.elevenlabs || process.env.ELEVENLABS_API_KEY || "";

    if (this.config.panelMode) {
      const [i1, i2] = pickTwoInterviewers(this.sessionId);
      this.panelInterviewers = [i1, i2];
      this.interviewerName = `${i1.name} & ${i2.name}`;
      this.gender = i1.gender; // primary avatar gender
      this.voiceId = getVoiceId(i1.gender);
      this.secondaryVoiceId = getVoiceId(i2.gender); // use same voice table — gender differs so voices differ
      this.systemPrompt = buildPanelSystemPrompt({
        interviewer1: i1,
        interviewer2: i2,
        documents: this.documents,
        config: this.config,
        jobTitle: guessJobTitle(this.documents.jobDescription),
      });
      this.tts = new ElevenLabsTTS(elKey, this.voiceId);
      this.tts2 = new ElevenLabsTTS(elKey, this.secondaryVoiceId);
    } else {
      const interviewer = pickInterviewer(this.sessionId);
      this.interviewerName = interviewer.name;
      this.gender = interviewer.gender;
      this.voiceId = getVoiceId(this.gender);
      this.systemPrompt = buildSystemPrompt({
        interviewerName: this.interviewerName,
        documents: this.documents,
        config: this.config,
        jobTitle: guessJobTitle(this.documents.jobDescription),
      });
      this.tts = new ElevenLabsTTS(elKey, this.voiceId);
    }

    const sttHandlers: STTHandlers = {
      onInterim: (text) => {
        // The candidate is actively speaking → cancel any pending nudge and
        // the settle countdown (don't cut them off mid-thought).
        this.candidateSpoke = true;
        this.consecutiveSilent = 0;
        this.clearSilence();
        this.clearSettle();
        this.emit({ type: "transcript:interim", text });
      },
      onFinal: (text) => {
        this.finalBuffer += (this.finalBuffer ? " " : "") + text;
        this.emit({ type: "transcript:final", text });
        // (Re)start the "have they finished?" countdown. Only when it elapses
        // with no new speech do we actually reply.
        this.restartSettle();
      },
      onUtteranceEnd: () => this.restartSettle(),
      onError: (m) => console.warn("[stt]", m),
    };
    try {
      this.stt = await this.createSTT(sttHandlers);
      await this.stt.start();
    } catch (err) {
      this.emit({
        type: "error",
        fatal: true,
        message:
          "No Deepgram API key. Add it at /keys or set DEEPGRAM_API_KEY in .env.local. (" + (err as Error).message + ")",
      });
      return;
    }

    // Tell the client who is interviewing + which avatar gender to render.
    if (this.panelInterviewers) {
      const [i1, i2] = this.panelInterviewers;
      this.emit({
        type: "status",
        state: "starting",
        message: this.interviewerName,
        gender: i1.gender,
        panelSecondary: { name: i2.name, gender: i2.gender },
      });
    } else {
      this.emit({
        type: "status",
        state: "starting",
        message: this.interviewerName,
        gender: this.gender,
      });
    }

    this.autosave = setInterval(() => this.persist("live"), AUTOSAVE_INTERVAL_MS);

    if (this.panelInterviewers) {
      const [i1, i2] = this.panelInterviewers;
      this.history.push({ role: "user", content: makePanelOpeningInstruction(i1.name, i2.name), synthetic: true });
    } else {
      this.history.push({ role: "user", content: OPENING_INSTRUCTION, synthetic: true });
    }
    await this.runBrainTurn();
  }

  handleAudio(buf: Buffer) {
    if (this.closed) return;
    this.stt?.sendAudio(buf);
  }

  handleVisionFrame(base64: string) {
    if (this.closed || this.analyzing) return;
    this.analyzing = true;
    analyzeFrame(base64)
      .then((a) => {
        this.analyzing = false;
        if (a && !this.closed) {
          this.latestVision = a;
          this.visionHistory.push(a);
          this.emit({ type: "vision:analysis", analysis: a });
          // Vision only feeds feedback — no live reactions during the interview.
        }
      })
      .catch(() => {
        this.analyzing = false;
      });
  }

  /** Receive aggregated in-browser CV metrics (the "model's perspective"). */
  handleCvMetrics(metrics: CvMetrics) {
    if (this.closed) return;
    this.cvMetrics = metrics;
  }

  /** Client browser finished playing the audio — now arm silence detection. */
  handlePlaybackComplete() {
    // Panel inter-segment sync: resolver takes priority.
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

  /** Waits for the client to confirm it finished playing the current audio chunk.
   *  Used between panel segments so speaker B's audio never overlaps speaker A's. */
  private waitForPanelPlayback(timeoutMs = 20000): Promise<void> {
    return new Promise<void>((resolve) => {
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

  end() {
    if (this.finished || this.closed) return;
    void this.finish();
  }

  dispose() {
    this.closed = true;
    this.clearSilence();
    this.clearSettle();
    if (this.autosave) clearInterval(this.autosave);
    this.autosave = null;
    this.stt?.close();
    this.stt = null;
    this.tts2 = null;
  }

  /* ─────────────────────────────── turns ──────────────────────────────── */

  private maybeProcessTurn() {
    this.clearSettle();
    const answer = this.finalBuffer.trim();
    if (!answer || this.generating || this.closed) return;
    this.finalBuffer = "";
    this.stopAwaiting();
    this.consecutiveSilent = 0;
    this.exchangeCount++;
    this.history.push({ role: "user", content: answer });
    void this.runBrainTurn();
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

  private buildMessages(): { role: "user" | "assistant"; content: string }[] {
    // Vision is intentionally excluded here — it only feeds into the final
    // feedback report, not the live conversation. This keeps the interview
    // flow clean and uninterrupted.
    return this.history.map((m) => ({ role: m.role, content: m.content }));
  }

  private async runBrainTurn() {
    if (this.panelInterviewers) {
      return this.runBrainTurnPanel();
    }
    if (this.closed || !this.tts) return;
    this.generating = true;
    this.clearSilence();
    this.emit({ type: "ai:thinking" });

    const tts = this.tts.createSession({
      onStart: () => this.emit({ type: "avatar:speaking:start" }),
      onAudio: (buf) => this.emitAudio(buf),
      onError: (m) => console.warn("[tts]", m),
    });

    let full = "";
    let buffer = "";

    try {
      const stream = getAnthropic(this.sessionKeys.anthropic).messages.stream({
        model: BRAIN_MODEL,
        max_tokens: 400,
        system: this.systemPrompt,
        messages: this.buildMessages(),
      });
      stream.on("text", (delta: string) => {
        full += delta;
        buffer += delta;
        const { send, keep } = flushable(buffer);
        if (send) {
          tts.sendText(send);
          buffer = keep;
        }
      });
      await stream.finalMessage();
    } catch (err) {
      console.warn("[brain]", (err as Error).message);
      tts.abort();
      this.generating = false;
      this.emit({
        type: "error",
        message: "The interviewer had trouble responding. Please try again.",
      });
      return;
    }

    const tail = stripToken(buffer).trim();
    if (tail) tts.sendText(tail + " ");
    tts.endInput();

    const complete = full.includes(COMPLETE_TOKEN);
    const spoken = stripToken(full).trim();
    if (spoken) this.history.push({ role: "assistant", content: spoken });

    await tts.done;

    // Emit the full interviewer line once, AFTER tts.done (all audio data sent),
    // so text appears when audio is playing — not before.
    if (spoken) this.emit({ type: "interview:question", text: spoken });

    this.emit({ type: "avatar:speaking:end" });
    this.generating = false;

    // If the user spoke while we were generating, restartSettle() was a no-op
    // (it guards on generating). Process those buffered words now.
    if (this.finalBuffer.trim()) {
      this.restartSettle();
      return;
    }

    if (complete && this.exchangeCount >= this.minExchanges) {
      await this.finish();
    } else {
      this.pendingArmSilence = true;
    }
  }

  private async runBrainTurnPanel() {
    if (this.closed || !this.tts || !this.panelInterviewers) return;
    this.generating = true;
    this.clearSilence();
    this.emit({ type: "ai:thinking" });

    let full = "";
    try {
      const stream = getAnthropic(this.sessionKeys.anthropic).messages.stream({
        model: BRAIN_MODEL,
        max_tokens: 600,
        system: this.systemPrompt,
        messages: this.buildMessages(),
      });
      stream.on("text", (delta: string) => { full += delta; });
      await stream.finalMessage();
    } catch (err) {
      console.warn("[brain/panel]", (err as Error).message);
      this.generating = false;
      this.emit({ type: "error", message: "The interviewers had trouble responding. Please try again." });
      return;
    }

    const complete = full.includes(COMPLETE_TOKEN);
    const spoken = stripToken(full).trim();
    if (spoken) this.history.push({ role: "assistant", content: spoken });

    const [i1, i2] = this.panelInterviewers;
    const segments = parsePanelSegments(spoken, [i1.name, i2.name]);
    const fullSpoken: string[] = [];

    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      if (this.closed) break;
      const isPrimary = seg.name === i1.name;
      const gender: Gender = isPrimary ? i1.gender : i2.gender;
      // Each speaker has their own TTS instance so voices never bleed across.
      const ttsInstance = isPrimary ? this.tts! : (this.tts2 ?? this.tts!);

      this.emit({ type: "panel:speaker", name: seg.name, gender });
      const tts = ttsInstance.createSession({
        onStart: () => this.emit({ type: "avatar:speaking:start" }),
        onAudio: (buf) => this.emitAudio(buf),
        onError: (m) => console.warn("[tts/panel]", m),
      });
      tts.sendText(seg.text + " ");
      tts.endInput();
      await tts.done;

      this.emit({ type: "avatar:speaking:end" });
      fullSpoken.push(seg.text);

      // Between segments: wait for client to confirm audio finished before
      // switching speaker. Skipped after the last segment — the existing
      // pendingArmSilence/playback:complete path handles that one.
      if (si < segments.length - 1 && !this.closed) {
        await this.waitForPanelPlayback();
      }
    }

    if (fullSpoken.length) this.emit({ type: "interview:question", text: fullSpoken.join(" ") });
    this.generating = false;

    if (this.finalBuffer.trim()) {
      this.restartSettle();
      return;
    }
    if (complete && this.exchangeCount >= this.minExchanges) {
      await this.finish();
    } else {
      this.pendingArmSilence = true;
    }
  }

  /** Speak a fixed line (reassurance / reaction) without invoking the brain. */
  private async speakLine(text: string) {
    if (this.closed || !this.tts || this.generating) return;
    this.generating = true;
    this.clearSilence();
    const tts = this.tts.createSession({
      onStart: () => this.emit({ type: "avatar:speaking:start" }),
      onAudio: (buf) => this.emitAudio(buf),
      onError: (m) => console.warn("[tts]", m),
    });
    tts.sendText(text + " ");
    tts.endInput();
    await tts.done;
    this.emit({ type: "interview:question", text });
    this.emit({ type: "avatar:speaking:end" });
    this.generating = false;
    if (this.finalBuffer.trim()) {
      this.restartSettle();
    } else {
      this.pendingArmSilence = true;
    }
  }

  /* ───────────────────────── silence / freeze handling ─────────────────── */

  private armSilence() {
    this.clearSilence();
    if (this.closed) return;
    this.awaitingAnswer = true;
    this.candidateSpoke = false;
    if (this.consecutiveSilent >= MAX_CONSECUTIVE_SILENT) return; // stop pestering
    const first = this.config.personality === "silent" ? NUDGE1_MS_SILENT : NUDGE1_MS;
    this.silenceTimer = setTimeout(() => void this.nudge(1), first);
  }

  private async nudge(level: number) {
    if (!this.awaitingAnswer || this.generating || this.closed || this.candidateSpoke) return;
    this.consecutiveSilent++;

    if (level === 1 && this.config.personality !== "silent") {
      await this.speakLine(pick(REASSURANCES));
      if (this.awaitingAnswer && !this.candidateSpoke && !this.closed) {
        this.silenceTimer = setTimeout(() => void this.nudge(2), NUDGE2_MS);
      }
      return;
    }

    // Escalate: let the brain reassure + rephrase or move on.
    this.stopAwaiting();
    const moveon = this.panelInterviewers
      ? makePanelMoveonInstruction(this.panelInterviewers[0].name, this.panelInterviewers[1].name)
      : MOVEON_INSTRUCTION;
    this.history.push({ role: "user", content: moveon, synthetic: true });
    await this.runBrainTurn();
  }

  private clearSilence() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
  }

  private stopAwaiting() {
    this.awaitingAnswer = false;
    this.clearSilence();
  }

  /* ──────────────────────────── vision reactions ──────────────────────── */

  private reactToVision(a: VisionAnalysis) {
    const wasPresent = this.lastPresence === "present";
    this.lastPresence = a.presence;

    // Proactively check in if the candidate leaves the frame mid-wait.
    if (
      wasPresent &&
      a.presence === "absent" &&
      this.awaitingAnswer &&
      !this.generating &&
      !this.candidateSpoke &&
      Date.now() - this.lastReactionAt > REACT_COOLDOWN_MS
    ) {
      this.lastReactionAt = Date.now();
      void this.speakLine(pick(ABSENT_LINES)).then(() => this.armSilence());
    }
    // Other cues (waving, nervousness, looking away) are folded into the brain's
    // context via formatVisionContext, so the interviewer reacts on its next turn.
  }

  /* ────────────────────────────── feedback ────────────────────────────── */

  private async finish() {
    if (this.finished) return;
    this.finished = true;
    this.stopAwaiting();
    this.emit({ type: "ai:thinking" });
    this.stt?.close();
    this.stt = null;

    const feedback = await this.generateFeedback();
    await this.persist("complete", feedback);
    this.emit({ type: "interview:complete", feedback });
    this.dispose();
  }

  private async generateFeedback(): Promise<InterviewFeedback> {
    const transcript = this.buildTranscript();
    try {
      const resp = await getAnthropic(this.sessionKeys.anthropic).messages.create({
        model: FEEDBACK_MODEL,
        max_tokens: 2048,
        system: FEEDBACK_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildFeedbackUserPrompt({
              transcript,
              visionAnalyses: this.visionHistory,
              cvMetrics: this.cvMetrics,
              config: this.config,
            }),
          },
        ],
      });
      const block = resp.content.find((b) => b.type === "text");
      const text = block && "text" in block ? block.text : "";
      const parsed = extractJson<InterviewFeedback>(text);
      if (parsed && parsed.dimensions && Array.isArray(parsed.topThreeImprovements)) {
        const fb = normalizeFeedback(parsed);
        if (this.cvMetrics) fb.visionReport.liveMetrics = this.cvMetrics;
        return fb;
      }
    } catch (err) {
      console.warn("[feedback]", (err as Error).message);
    }
    const fb = this.fallbackFeedback(transcript);
    if (this.cvMetrics) fb.visionReport.liveMetrics = this.cvMetrics;
    return fb;
  }

  private buildTranscript(): TranscriptTurn[] {
    const turns: TranscriptTurn[] = [];
    this.history.forEach((m) => {
      if (m.synthetic) return; // skip internal instructions
      turns.push({
        role: m.role === "assistant" ? "interviewer" : "candidate",
        text: m.content,
        ts: Date.now(),
      });
    });
    return turns;
  }

  private fallbackFeedback(transcript: TranscriptTurn[]): InterviewFeedback {
    const answered = transcript.filter((t) => t.role === "candidate").length;
    const base = answered > 0 ? 62 : 0;
    return {
      overallScore: base,
      grade: answered > 0 ? "C" : "F",
      dimensions: {
        communication: base,
        technicalDepth: base,
        confidence: base,
        relevance: base,
        structure: base,
      },
      answerAnnotations: transcript
        .filter((t) => t.role === "candidate")
        .slice(0, 8)
        .map((t) => ({
          question: "",
          answer: t.text,
          quality: "weak" as const,
          annotation: "Automated scoring was unavailable for this answer.",
        })),
      visionReport: {
        eyeContactScore: 60,
        bodyLanguageSummary: "Detailed analysis was unavailable for this session.",
        presentationNotes: "—",
      },
      topThreeImprovements: [
        "Re-run the interview once the scoring service is reachable for full feedback.",
        "Aim for specific, quantified examples in each answer.",
        "Keep answers structured: headline first, then detail.",
      ],
      strengths: answered > 0 ? ["You completed the interview."] : [],
      overallSummary:
        "We couldn’t generate a full AI evaluation for this session, but your transcript was captured.",
    };
  }

  private async persist(status: "live" | "complete", feedback?: InterviewFeedback) {
    if (!this.sessionId) return;
    await saveSessionSnapshot({
      sessionId: this.sessionId,
      config: this.config,
      transcript: this.buildTranscript(),
      vision: this.visionHistory,
      status,
      feedback,
    });
  }

  private async createSTT(handlers: STTHandlers): Promise<STTConnection> {
    const dgKey = this.sessionKeys.deepgram || process.env.DEEPGRAM_API_KEY;
    if (dgKey) {
      console.log("[stt] using Deepgram nova-3");
      return new DeepgramSTT(dgKey, handlers, this.sampleRate);
    }
    throw new Error("No Deepgram API key. Add it at /keys or set DEEPGRAM_API_KEY in .env.local.");
  }

  private missingKeys(): string[] {
    const need: string[] = [];
    if (!(this.sessionKeys.anthropic || process.env.ANTHROPIC_API_KEY)) need.push("ANTHROPIC_API_KEY");
    if (!(this.sessionKeys.elevenlabs || process.env.ELEVENLABS_API_KEY)) need.push("ELEVENLABS_API_KEY");
    if (!(this.sessionKeys.deepgram || process.env.DEEPGRAM_API_KEY)) need.push("DEEPGRAM_API_KEY");
    return need;
  }
}

/* ─────────────────────────── text helpers ───────────────────────────────── */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function parsePanelSegments(
  text: string,
  speakerNames: string[],
): Array<{ name: string; text: string }> {
  const escaped = speakerNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const tagRe = new RegExp(`\\[(${escaped.join("|")})\\]`, "g");
  const segments: Array<{ name: string; text: string }> = [];
  let lastName: string | null = null;
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(text)) !== null) {
    if (lastName !== null && m.index > lastIdx) {
      const seg = text.slice(lastIdx, m.index).trim();
      if (seg) segments.push({ name: lastName, text: seg });
    }
    lastName = m[1];
    lastIdx = m.index + m[0].length;
  }

  if (lastName !== null && lastIdx < text.length) {
    const seg = text.slice(lastIdx).trim();
    if (seg) segments.push({ name: lastName, text: seg });
  }

  // Fallback: no tags found — attribute to primary speaker
  if (segments.length === 0 && text.trim()) {
    segments.push({ name: speakerNames[0] ?? "Interviewer", text: text.trim() });
  }

  return segments;
}

function stripToken(s: string): string {
  return s.split(COMPLETE_TOKEN).join("");
}

/**
 * Pulls complete sentences out of a streaming buffer to feed TTS, while holding
 * back any text that might be a partial [INTERVIEW_COMPLETE] token.
 */
function flushable(buf: string): { send: string; keep: string } {
  let safeEnd = buf.length;
  const lastBracket = buf.lastIndexOf("[");
  if (lastBracket !== -1) {
    const tail = buf.slice(lastBracket);
    if (COMPLETE_TOKEN.startsWith(tail) || tail.startsWith(COMPLETE_TOKEN)) {
      safeEnd = lastBracket;
    }
  }
  const safe = buf.slice(0, safeEnd);
  const m = safe.match(/^[\s\S]*?[.?!…]["')\]]?\s/);
  if (m) {
    const cut = m[0].length;
    return { send: buf.slice(0, cut), keep: buf.slice(cut) };
  }
  return { send: "", keep: buf };
}

function clamp100(n: unknown, fallback = 0): number {
  const v = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function normalizeFeedback(fb: InterviewFeedback): InterviewFeedback {
  return {
    overallScore: clamp100(fb.overallScore, 60),
    grade: (fb.grade as string)?.slice(0, 2) as InterviewFeedback["grade"],
    dimensions: {
      communication: clamp100(fb.dimensions?.communication),
      technicalDepth: clamp100(fb.dimensions?.technicalDepth),
      confidence: clamp100(fb.dimensions?.confidence),
      relevance: clamp100(fb.dimensions?.relevance),
      structure: clamp100(fb.dimensions?.structure),
    },
    answerAnnotations: Array.isArray(fb.answerAnnotations)
      ? fb.answerAnnotations.slice(0, 8).map((a) => ({
          question: String(a.question ?? ""),
          answer: String(a.answer ?? ""),
          quality:
            a.quality === "strong" || a.quality === "missed" ? a.quality : "weak",
          annotation: String(a.annotation ?? ""),
        }))
      : [],
    visionReport: {
      eyeContactScore: clamp100(fb.visionReport?.eyeContactScore, 60),
      bodyLanguageSummary: String(fb.visionReport?.bodyLanguageSummary ?? "—"),
      presentationNotes: String(fb.visionReport?.presentationNotes ?? "—"),
    },
    topThreeImprovements: (fb.topThreeImprovements ?? []).slice(0, 3).map(String),
    strengths: (fb.strengths ?? []).slice(0, 5).map(String),
    overallSummary: String(fb.overallSummary ?? ""),
  };
}
