/**
 * Shared domain + realtime-protocol types.
 *
 * This module is imported by BOTH the browser app (via the "@/types/interview"
 * alias) and the standalone WebSocket server (via a relative import). Keep it
 * free of any runtime browser/node-only code — only types and plain constants.
 */

/* ─────────────────────────── Interview configuration ────────────────────── */

export type InterviewType = "behavioral" | "technical" | "mixed";
export type Difficulty = "entry" | "mid" | "senior" | "brutal";
export type Personality = "friendly" | "neutral" | "tough" | "silent";
/** Target duration, in minutes. */
export type DurationMinutes = 10 | 20 | 30;

/**
 * Interview mode determines what context the AI has and how it starts.
 * - standard   : resume + cover letter + full JD (classic)
 * - resume-only: only resume + job role name; AI infers the rest
 * - blind      : no context; AI discovers everything through conversation
 * - custom     : user writes a free-form prompt describing the interview
 */
export type InterviewMode = "standard" | "resume-only" | "blind" | "custom";

export interface InterviewConfig {
  type: InterviewType;
  difficulty: Difficulty;
  duration: DurationMinutes;
  personality: Personality;
  mode: InterviewMode;
  /** Free-form prompt used when mode === "custom". */
  customPrompt?: string;
  /** Short job role name used when mode === "resume-only". */
  jobRole?: string;
  /** When true, two interviewers conduct the session together. */
  panelMode?: boolean;
}

export interface InterviewDocuments {
  resumeText: string;
  coverLetterText: string;
  jobDescription: string;
}

/** Per-session API keys (BYOK). Server uses env vars as fallback. */
export interface SessionKeys {
  anthropic?: string;
  elevenlabs?: string;
  deepgram?: string;
}

export const DEFAULT_CONFIG: InterviewConfig = {
  type: "mixed",
  difficulty: "mid",
  duration: 20,
  personality: "neutral",
  mode: "standard",
};

/* ──────────────────────────── Vision analysis ───────────────────────────── */

export type EyeContact = "strong" | "moderate" | "weak" | "none";
export type Posture = "confident" | "neutral" | "slouched" | "tense";
export type Expression =
  | "calm"
  | "nervous"
  | "confused"
  | "engaged"
  | "blank";
export type Presentation = "professional" | "casual" | "unprofessional";
export type Presence = "present" | "absent";
export type Gesture =
  | "none"
  | "waving"
  | "hand_raised"
  | "touching_face"
  | "looking_away"
  | "on_phone"
  | "shrugging";

export interface VisionAnalysis {
  presence: Presence;
  eyeContact: EyeContact;
  posture: Posture;
  expression: Expression;
  presentation: Presentation;
  gesture: Gesture;
  /** One brief observation, or null when nothing notable. */
  notes: string | null;
  /** Server-stamped capture time (ms epoch). */
  ts?: number;
}

export type Gender = "male" | "female";

/**
 * Real-time metrics computed in-browser by MediaPipe (the "model's perspective").
 * These are aggregated over the whole interview and sent to the server for the
 * final feedback — no images leave the device for these.
 */
export interface CvMetrics {
  /** Frames analyzed locally. */
  frames: number;
  /** % of frames a face was detected. */
  presentPct: number;
  /** % of frames the candidate was looking at the camera. */
  eyeContactPct: number;
  /** Blinks per minute. */
  blinksPerMin: number;
  /** % of frames showing a smile. */
  smilePct: number;
  /** 0-100 head steadiness (100 = very still, low fidgeting). */
  headSteadiness: number;
  /** 0-100 composite engagement score. */
  engagement: number;
}

/* ─────────────────────────────── Transcript ─────────────────────────────── */

export type SpeakerRole = "interviewer" | "candidate";

export interface TranscriptTurn {
  role: SpeakerRole;
  text: string;
  ts: number;
}

/* ──────────────────────────────── Feedback ──────────────────────────────── */

export type Grade =
  | "A+"
  | "A"
  | "A-"
  | "B+"
  | "B"
  | "B-"
  | "C+"
  | "C"
  | "C-"
  | "D"
  | "F";

export type AnswerQuality = "strong" | "weak" | "missed";

export interface AnswerAnnotation {
  question: string;
  answer: string;
  quality: AnswerQuality;
  annotation: string;
}

export interface FeedbackDimensions {
  communication: number;
  technicalDepth: number;
  confidence: number;
  relevance: number;
  structure: number;
}

export interface VisionReport {
  eyeContactScore: number;
  bodyLanguageSummary: string;
  presentationNotes: string;
  /** Raw live-tracking metrics from MediaPipe (shown alongside the narrative). */
  liveMetrics?: CvMetrics;
}

export interface InterviewFeedback {
  overallScore: number;
  grade: Grade;
  dimensions: FeedbackDimensions;
  answerAnnotations: AnswerAnnotation[];
  visionReport: VisionReport;
  topThreeImprovements: string[];
  strengths: string[];
  overallSummary: string;
}

/* ─────────────────────────── Realtime WS protocol ───────────────────────── */
/**
 * Control messages are sent as JSON text frames. Audio (both directions) is
 * sent as raw BINARY frames for efficiency:
 *   • client → server binary  = microphone PCM (16-bit LE @ 16 kHz)
 *   • server → client binary  = ElevenLabs TTS PCM (16-bit LE @ 24 kHz)
 */

export interface ClientStartMessage {
  type: "interview:start";
  sessionId: string;
  resumeText: string;
  coverLetterText: string;
  jobDescription: string;
  config: InterviewConfig;
  /** Actual microphone PCM sample rate (Hz), so STT gets clean, un-resampled audio. */
  audioSampleRate?: number;
  /** Per-session API keys (BYOK). Server env vars are used as fallback. */
  apiKeys?: SessionKeys;
}

export interface ClientVisionMessage {
  type: "vision:frame";
  /** base64-encoded JPEG (no data: prefix). */
  data: string;
}

/**
 * Client sends this when audio playback has actually finished on the speaker.
 * The server uses this (not `tts.done`) to arm the silence/settle timer.
 */
export interface ClientPlaybackComplete {
  type: "playback:complete";
}

/** Periodic aggregated CV metrics from the in-browser MediaPipe tracker. */
export interface ClientCvMetrics {
  type: "cv:metrics";
  metrics: CvMetrics;
}

export interface ClientEndMessage {
  type: "interview:end";
}

export type ClientMessage =
  | ClientStartMessage
  | ClientVisionMessage
  | ClientPlaybackComplete
  | ClientCvMetrics
  | ClientEndMessage;

export interface ServerSpeakingStart {
  type: "avatar:speaking:start";
}
export interface ServerSpeakingEnd {
  type: "avatar:speaking:end";
}
export interface ServerTranscriptInterim {
  type: "transcript:interim";
  text: string;
}
export interface ServerTranscriptFinal {
  type: "transcript:final";
  text: string;
}
export interface ServerVisionAnalysis {
  type: "vision:analysis";
  analysis: VisionAnalysis;
}
export interface ServerThinking {
  type: "ai:thinking";
}
export interface ServerQuestion {
  type: "interview:question";
  text: string;
}
export interface ServerComplete {
  type: "interview:complete";
  feedback: InterviewFeedback;
}
export interface ServerStatus {
  type: "status";
  state: "connected" | "starting" | "live" | "closing";
  /** Interviewer display name, when known. */
  message?: string;
  /** Interviewer gender — drives the avatar variant on the client. */
  gender?: Gender;
  /** Panel mode: second interviewer info (name + gender). */
  panelSecondary?: { name: string; gender: Gender };
}
/** Panel mode: emitted before each speaker segment so the client can switch avatar/name. */
export interface ServerPanelSpeaker {
  type: "panel:speaker";
  name: string;
  gender: Gender;
}
/** Panel mode: text spoken by each individual segment (for per-speaker transcript). */
export interface ServerPanelSegment {
  type: "panel:segment";
  name: string;
  text: string;
}
export interface ServerError {
  type: "error";
  message: string;
  fatal?: boolean;
}

export type ServerMessage =
  | ServerSpeakingStart
  | ServerSpeakingEnd
  | ServerTranscriptInterim
  | ServerTranscriptFinal
  | ServerVisionAnalysis
  | ServerThinking
  | ServerQuestion
  | ServerComplete
  | ServerStatus
  | ServerPanelSpeaker
  | ServerPanelSegment
  | ServerError;

/* ─────────────────────────────── Constants ──────────────────────────────── */

/** Microphone capture + Deepgram input rate. */
export const MIC_SAMPLE_RATE = 16000;
/** ElevenLabs output + browser playback rate. */
export const TTS_SAMPLE_RATE = 24000;
/**
 * How often a webcam frame is sent to Claude vision (the qualitative
 * "Claude's perspective"). Once a minute — ~10 calls in a 10-min interview.
 * Continuous measurable metrics come from the in-browser MediaPipe tracker
 * instead, so this can be sparse.
 */
export const VISION_INTERVAL_MS = 60000;
/** How often aggregated MediaPipe metrics are pushed to the server. */
export const CV_METRICS_INTERVAL_MS = 20000;
/** How often the live session is checkpointed to Supabase. */
export const AUTOSAVE_INTERVAL_MS = 30000;

/* ───────────────────────── Human-readable option maps ───────────────────── */

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  mixed: "Mixed",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  entry: "Entry",
  mid: "Mid",
  senior: "Senior",
  brutal: "Brutal",
};

export const PERSONALITY_LABELS: Record<Personality, string> = {
  friendly: "Friendly",
  neutral: "Neutral",
  tough: "Tough",
  silent: "Silent",
};
