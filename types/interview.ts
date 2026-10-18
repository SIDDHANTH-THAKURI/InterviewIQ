/**
 * Shared domain + realtime-protocol types.
 *
 * Imported by BOTH the browser app (via "@/types/interview") and the Node
 * server (via relative imports). Keep it free of runtime browser/node-only
 * code — only types and plain constants.
 */

/* ─────────────────────────── Interview configuration ────────────────────── */

/** What kind of practice the session is. Drives prompts, length and scoring. */
export type PracticeFormat =
  | "full" // full mock interview
  | "drill" // 2–3 rapid questions, quick feedback
  | "behavioral" // STAR coaching
  | "technical" // technical deep-dive
  | "pitch" // "tell me about yourself" / elevator pitch
  | "salary" // salary & offer negotiation role-play
  | "weakspot" // targets the user's weakest dimension
  | "custom"; // free-form scenario

export type Difficulty = "gentle" | "standard" | "challenging" | "brutal";
export type Persona = "warm" | "neutral" | "tough" | "silent";
export type InputMode = "voice" | "text";
export type AvatarStyle = "aura" | "human";
export type Gender = "male" | "female";

/** BCP-47-ish codes we support end-to-end (Deepgram STT + ElevenLabs Flash). */
export type InterviewLanguage = "en" | "multi" | "hi" | "es" | "fr" | "de" | "pt";

/** Target duration, in minutes. */
export type DurationMinutes = 5 | 10 | 15 | 20 | 30;

export interface InterviewContext {
  /** Target role title, e.g. "Senior Product Designer". */
  role: string;
  company?: string;
  jobDescription?: string;
  resumeText?: string;
  /** Extra notes, the custom scenario, or the weak spot to focus on. */
  notes?: string;
}

export interface InterviewConfig {
  format: PracticeFormat;
  difficulty: Difficulty;
  persona: Persona;
  duration: DurationMinutes;
  inputMode: InputMode;
  /** Interviewer speaks out loud (TTS). Off = captions only. */
  voiceOut: boolean;
  /** Webcam on for presence analysis. */
  camera: boolean;
  language: InterviewLanguage;
  avatar: AvatarStyle;
  /** Two interviewers instead of one. */
  panel: boolean;
  /** Allow the private coach (hints) during the interview. */
  coach: boolean;
  /** "Real interviewer" mode: reacts to what the camera sees (hand raised, leaving, phone…). */
  awareness: boolean;
  /** The interviewer can see a shared screen (code, slides). */
  screenShare: boolean;
}

export const DEFAULT_CONFIG: InterviewConfig = {
  format: "full",
  difficulty: "standard",
  persona: "warm",
  duration: 15,
  inputMode: "voice",
  voiceOut: true,
  camera: true,
  language: "en",
  avatar: "human",
  panel: false,
  coach: true,
  awareness: false,
  screenShare: false,
};

/* ──────────────────────────── Vision analysis ───────────────────────────── */

export type EyeContact = "strong" | "moderate" | "weak" | "none";
export type Posture = "confident" | "neutral" | "slouched" | "tense";
export type Expression = "calm" | "nervous" | "confused" | "engaged" | "blank";
export type Presentation = "professional" | "casual" | "unprofessional";
export type Presence = "present" | "absent";

export interface VisionAnalysis {
  presence: Presence;
  eyeContact: EyeContact;
  posture: Posture;
  expression: Expression;
  presentation: Presentation;
  notes: string | null;
  ts?: number;
}

/** Things a real interviewer would notice on camera, detected on-device. */
export type PresenceKind =
  | "absent" // left the frame
  | "returned" // came back
  | "hand_raised"
  | "pointing"
  | "phone"
  | "other_person"
  | "looking_away" // sustained, not a glance
  | "confused"
  | "smiling";

export interface PresenceEvent {
  kind: PresenceKind;
  /** Seconds since the interview started. */
  at: number;
  /** How long it lasted, when known. */
  durationSec?: number;
}

/** Real-time metrics computed in-browser by MediaPipe. No images leave the device. */
export interface CvMetrics {
  frames: number;
  presentPct: number;
  eyeContactPct: number;
  blinksPerMin: number;
  smilePct: number;
  headSteadiness: number;
  engagement: number;
}

/* ─────────────────────────────── Transcript ─────────────────────────────── */

export type SpeakerRole = "interviewer" | "candidate";

export interface TranscriptTurn {
  role: SpeakerRole;
  text: string;
  ts: number;
  /** Interviewer display name (panel mode). */
  speaker?: string;
  /** Seconds the candidate actually spoke in this turn (voice mode). */
  speakingSec?: number;
}

/** Measured delivery stats, computed server-side from the transcript. */
export interface DeliveryStats {
  answers: number;
  totalWords: number;
  /** Words per minute while speaking (voice only). */
  wpm: number | null;
  avgAnswerWords: number;
  fillerCount: number;
  fillerPer100: number;
  topFillers: { word: string; count: number }[];
  hintsUsed: number;
}

/* ──────────────────────────────── Feedback ──────────────────────────────── */

export type Grade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D" | "F";
export type AnswerQuality = "strong" | "solid" | "weak" | "missed";
export type HiringSignal = "strong_yes" | "yes" | "lean_yes" | "lean_no" | "no";

export const DIMENSIONS = [
  "communication",
  "structure",
  "relevance",
  "depth",
  "confidence",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export type DimensionScores = Record<Dimension, number>;

export const DIMENSION_LABELS: Record<Dimension, string> = {
  communication: "Communication",
  structure: "Structure",
  relevance: "Relevance",
  depth: "Depth",
  confidence: "Confidence",
};

export interface AnswerReview {
  question: string;
  answer: string;
  quality: AnswerQuality;
  score: number;
  whatWorked: string;
  toImprove: string;
  /** A rewritten, stronger version of the candidate's answer, in their voice. */
  strongerAnswer: string;
}

export interface Improvement {
  title: string;
  detail: string;
  /** A concrete exercise for the next session. */
  drill: string;
}

export interface InterviewFeedback {
  overallScore: number;
  grade: Grade;
  headline: string;
  summary: string;
  hiringSignal: HiringSignal;
  hiringSignalReason: string;
  dimensions: DimensionScores;
  strengths: string[];
  improvements: Improvement[];
  answers: AnswerReview[];
  presence: {
    score: number | null;
    summary: string;
  };
  nextSession: {
    format: PracticeFormat;
    focus: string;
    why: string;
  };
  delivery?: DeliveryStats;
  liveMetrics?: CvMetrics;
  /** On-camera moments worth knowing about (awareness mode). */
  presenceEvents?: PresenceEvent[];
}

/* ─────────────────────────────── Prep packs ─────────────────────────────── */

export interface PrepQuestion {
  question: string;
  category: string;
  whyTheyAsk: string;
  answerOutline: string[];
  /** Which of the candidate's stories fits best. */
  useStory?: string;
}

export interface PrepStory {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  goodFor: string[];
}

export interface PrepPack {
  role: string;
  company?: string;
  snapshot: string;
  whatTheyWant: string[];
  yourEdge: string[];
  gaps: { gap: string; howToAddress: string }[];
  questions: PrepQuestion[];
  stories: PrepStory[];
  questionsToAsk: string[];
  companyNotes?: string[];
  dayOfChecklist: string[];
}

/* ─────────────────────────── Candidate profile ──────────────────────────── */

export interface CandidateProfile {
  name: string;
  headline: string;
  targetRole: string;
  experienceLevel: "student" | "entry" | "mid" | "senior" | "lead" | "career-change";
  resumeText: string;
  resumeFileName?: string;
  /** Short AI-extracted summary of the resume. */
  summary?: string;
  skills?: string[];
  /** How the candidate feels about interviews (1 calm … 5 very anxious). */
  nerves: number;
  goals: string[];
  preferredLanguage: InterviewLanguage;
  createdAt: number;
  updatedAt: number;
}

/* ─────────────────────────────── Access ─────────────────────────────────── */

export interface AccessInfo {
  id: string;
  name: string;
  role: "admin" | "member";
  limits: { minutesPerMonth: number | null; prepsPerMonth: number | null };
  usage: { minutes: number; preps: number; sessions: number; costUsd: number };
}

/* ─────────────────────────── Realtime WS protocol ───────────────────────── */
/**
 * Control messages are JSON text frames. Audio is raw BINARY frames:
 *   • client → server binary = microphone PCM (16-bit LE, native rate)
 *   • server → client binary = ElevenLabs TTS PCM (16-bit LE @ 24 kHz)
 */

export interface ClientStartMessage {
  type: "interview:start";
  /** Invite pass — the session runs on the owner's keys. */
  pass?: string;
  /** Bring-your-own-keys — used for this session only, never stored. */
  keys?: { anthropic: string; elevenlabs?: string; deepgram?: string };
  sessionId: string;
  config: InterviewConfig;
  context: InterviewContext;
  candidateName?: string;
  audioSampleRate?: number;
}

export type ClientMessage =
  | ClientStartMessage
  | { type: "vision:frame"; data: string }
  | { type: "playback:complete" }
  /** The room (incl. the 3D interviewer) is ready — the interviewer may begin. */
  | { type: "client:ready" }
  | { type: "cv:metrics"; metrics: CvMetrics }
  | { type: "candidate:text"; text: string }
  | { type: "presence:event"; event: PresenceEvent }
  /** JPEG (base64, no prefix) of the candidate's shared screen. */
  | { type: "screen:frame"; data: string }
  | { type: "screen:stopped" }
  | { type: "control:repeat" }
  | { type: "control:hint" }
  | { type: "control:skip" }
  | { type: "control:pause" }
  | { type: "control:resume" }
  | { type: "interview:end" };

export interface InterviewerInfo {
  name: string;
  gender: Gender;
  title: string;
  /** 3D character id (public/avatars/<avatar>.glb). */
  avatar: string;
}

export type ServerMessage =
  | { type: "status"; state: "connected" | "starting" | "live" | "paused" | "closing" }
  | { type: "session:ready"; interviewers: InterviewerInfo[]; maxMinutes: number }
  | { type: "avatar:speaking:start"; speaker?: string }
  /** Character timings for lip sync, in ms from the start of the current utterance. */
  | { type: "tts:align"; speaker: string; chars: string[]; starts: number[]; durs: number[] }
  /** The interviewer stopped talking mid-sentence (e.g. the candidate raised a hand). */
  | { type: "avatar:interrupted" }
  | { type: "avatar:speaking:end" }
  | { type: "interviewer:delta"; text: string }
  | { type: "interviewer:line"; text: string; speaker: string }
  | { type: "transcript:interim"; text: string }
  | { type: "transcript:final"; text: string }
  | { type: "candidate:committed"; text: string }
  | { type: "vision:analysis"; analysis: VisionAnalysis }
  | { type: "ai:thinking" }
  | { type: "coach:hint"; text: string }
  | { type: "interview:wrapping" }
  | { type: "interview:complete"; feedback: InterviewFeedback; transcript: TranscriptTurn[] }
  | { type: "error"; message: string; fatal?: boolean; code?: string };

/* ─────────────────────────────── Constants ──────────────────────────────── */

export const TTS_SAMPLE_RATE = 24000;
/** One qualitative vision read per minute; continuous metrics come from MediaPipe. */
export const VISION_INTERVAL_MS = 60000;
export const CV_METRICS_INTERVAL_MS = 20000;
export const REALTIME_PATH = "/realtime";

/* ───────────────────────── Human-readable option maps ───────────────────── */

export const FORMAT_META: Record<
  PracticeFormat,
  { label: string; blurb: string; minutes: DurationMinutes }
> = {
  full: { label: "Full mock interview", blurb: "The real thing, start to finish.", minutes: 20 },
  drill: { label: "Quick drill", blurb: "Three sharp questions in five minutes.", minutes: 5 },
  behavioral: { label: "Behavioral · STAR", blurb: "Stories that prove you can do the job.", minutes: 15 },
  technical: { label: "Technical deep-dive", blurb: "Depth, trade-offs and how you think.", minutes: 20 },
  pitch: { label: "Tell me about yourself", blurb: "Nail the first two minutes.", minutes: 5 },
  salary: { label: "Salary negotiation", blurb: "Practice asking for what you're worth.", minutes: 10 },
  weakspot: { label: "Fix my weak spot", blurb: "Targets your lowest-scoring skill.", minutes: 10 },
  custom: { label: "Custom scenario", blurb: "Describe any interview and rehearse it.", minutes: 15 },
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  gentle: "Gentle",
  standard: "Standard",
  challenging: "Challenging",
  brutal: "Brutal",
};

export const PERSONA_LABELS: Record<Persona, string> = {
  warm: "Warm",
  neutral: "Neutral",
  tough: "Tough",
  silent: "Poker-faced",
};

export const LANGUAGE_LABELS: Record<InterviewLanguage, string> = {
  en: "English",
  multi: "English + mixed (Hinglish etc.)",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
};
