/**
 * Anthropic client + prompt construction.
 *
 * Imported by both Next.js (server side) and the standalone WS server, so it
 * uses a RELATIVE import for shared types (keeps `tsx` resolution trivial) and
 * never touches browser globals.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  DIFFICULTY_LABELS,
  INTERVIEW_TYPE_LABELS,
  PERSONALITY_LABELS,
  type InterviewConfig,
  type InterviewDocuments,
  type TranscriptTurn,
  type VisionAnalysis,
} from "../types/interview";

/* ───────────────────────────────── Models ───────────────────────────────── */

/** The interviewer's brain: adaptive questioning + final feedback. */
export const BRAIN_MODEL = "claude-opus-4-8";
export const FEEDBACK_MODEL = "claude-opus-4-8";
/** Vision runs every ~3s, so it uses the fast/cheap model for low latency. */
export const VISION_MODEL = "claude-haiku-4-5-20251001";

let _client: Anthropic | null = null;

/** Returns an Anthropic client. If a per-session key is provided it takes
 *  precedence; otherwise falls back to the ANTHROPIC_API_KEY env var. */
export function getAnthropic(sessionKey?: string): Anthropic {
  const apiKey = sessionKey?.trim() || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  // Use a per-session client when the key differs from the cached singleton.
  if (sessionKey?.trim() && sessionKey.trim() !== process.env.ANTHROPIC_API_KEY) {
    return new Anthropic({ apiKey });
  }
  if (!_client) _client = new Anthropic({ apiKey });
  return _client;
}

/* ─────────────────────── Interviewer persona / system prompt ─────────────── */

export type Gender = "male" | "female";

export interface Interviewer {
  name: string;
  gender: Gender;
}

const INTERVIEWERS: Interviewer[] = [
  { name: "Maya Chen", gender: "female" },
  { name: "David Okafor", gender: "male" },
  { name: "Elena Rossi", gender: "female" },
  { name: "James Whitfield", gender: "male" },
  { name: "Priya Nair", gender: "female" },
  { name: "Marcus Lindqvist", gender: "male" },
];

export function pickInterviewer(seed?: string): Interviewer {
  if (!seed) {
    return INTERVIEWERS[Math.floor(Math.random() * INTERVIEWERS.length)];
  }
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return INTERVIEWERS[h % INTERVIEWERS.length];
}

/**
 * Resolves the ElevenLabs voice id for a gender. Defaults are verified-valid
 * premade voices; override per gender via env to use any voice in your account.
 */
export function getVoiceId(gender: Gender): string {
  const male = process.env.ELEVENLABS_VOICE_ID_MALE || "pNInz6obpgDQGcFmaJgB"; // Adam
  const female = process.env.ELEVENLABS_VOICE_ID_FEMALE || "EXAVITQu4vr4xnSDxMaL"; // Sarah
  return gender === "male" ? male : female;
}

/** Best-effort guess at the job title from the first meaningful JD line. */
export function guessJobTitle(jobDescription: string): string {
  const lines = jobDescription
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines.slice(0, 6)) {
    if (line.length >= 3 && line.length <= 80 && !/[.:;]$/.test(line)) {
      return line.replace(/^(job title|title|position|role)\s*[:\-]\s*/i, "");
    }
  }
  return "this role";
}

const DIFFICULTY_GUIDANCE: Record<InterviewConfig["difficulty"], string> = {
  entry:
    "Keep questions approachable. Give the candidate room. Offer gentle hints if they stall.",
  mid: "Ask solid, role-relevant questions. Expect concrete examples and push lightly when answers stay vague.",
  senior:
    "Probe for depth, trade-offs and ownership. Challenge hand-wavy answers. Expect leadership and systems thinking.",
  brutal:
    "Be relentless. Interrupt rambling, demand specifics and numbers, expose gaps, and push back hard on every weak claim. Do not let anything slide.",
};

const PERSONALITY_GUIDANCE: Record<InterviewConfig["personality"], string> = {
  friendly:
    "Warm and encouraging. Smile in your words, affirm good points, keep the candidate at ease.",
  neutral:
    "Professional and even-handed. Polite but not effusive. Let answers stand on their own.",
  tough:
    "Skeptical and demanding. Sparse praise. Make the candidate earn every bit of approval.",
  silent:
    "Minimal. Use long pauses and short prompts. Rarely encourage. Let silence do the work and see how they handle it.",
};

export interface SystemPromptParams {
  interviewerName: string;
  documents: InterviewDocuments;
  config: InterviewConfig;
  jobTitle?: string;
}

/** Builds the interviewer's system prompt, adapted to the interview mode. */
export function buildSystemPrompt({
  interviewerName,
  documents,
  config,
  jobTitle,
}: SystemPromptParams): string {
  const mode = config.mode ?? "standard";
  const approxQuestions = Math.max(4, Math.round(config.duration / 2.5));

  const SHARED_RULES = `Rules:
- Speak naturally, like a real human interviewer. No bullet points, no lists, no markdown — pure conversational speech that will be read aloud by a voice engine.
- Ask ONE question or make ONE comment at a time. Keep each turn short — 1 to 3 sentences. Real interviewers do not monologue.
- If their last answer was weak, vague, or evasive, probe it. Do not move on.
- React like a human: if they seem nervous, put them at ease; if confident, push harder; mirror their energy.
- If the candidate clearly didn't hear or froze, briefly rephrase or reassure.
- Vary your pacing. Sometimes react before asking. Sometimes just ask.
- Match the difficulty and personality described above in every turn.
- ALWAYS begin with a warm, natural introduction — greet them, introduce yourself briefly, and do a short icebreaker exchange (ask how they are, make them comfortable) BEFORE asking any interview questions.
- When it is time to end, close gracefully and warmly — thank them and tell them what happens next.
- After your closing remark, output exactly this token on its own: [INTERVIEW_COMPLETE]. It is a silent signal, never spoken aloud — say your goodbye first, THEN the token.
- You are NOT an AI assistant. You are a human interviewer named ${interviewerName}. Never break character.`;

  const CONFIG_BLOCK = `Interview config:
- Type: ${INTERVIEW_TYPE_LABELS[config.type]}
- Difficulty: ${DIFFICULTY_LABELS[config.difficulty]} — ${DIFFICULTY_GUIDANCE[config.difficulty]}
- Personality: ${PERSONALITY_LABELS[config.personality]} — ${PERSONALITY_GUIDANCE[config.personality]}
- Target duration: ${config.duration} minutes (roughly ${approxQuestions} substantive exchanges plus intro)`;

  if (mode === "blind") {
    return `You are ${interviewerName}, a senior interviewer. You know nothing about the candidate yet — no resume, no role, nothing. You will discover everything through conversation.

${CONFIG_BLOCK}

${SHARED_RULES}
- Additional for blind mode: Start by warmly introducing yourself, then gently uncover who they are and what they do through natural conversation. Ask about their background, current role, what they're looking for. Let the answers shape your questions. This should feel like a curious, exploratory conversation, not an interrogation.

Begin now.`;
  }

  if (mode === "custom") {
    return `You are ${interviewerName}, a senior interviewer. Here is the exact interview scenario you must conduct:

${config.customPrompt || "(no custom prompt provided)"}

${CONFIG_BLOCK}

${SHARED_RULES}

Begin now.`;
  }

  if (mode === "resume-only") {
    const role = config.jobRole || "this role";
    return `You are ${interviewerName}, a senior interviewer conducting an interview for the position of "${role}".

Candidate resume:
${documents.resumeText || "(not provided)"}

${CONFIG_BLOCK}

${SHARED_RULES}
- Additional: You only have the resume. Infer the JD from the role name and the candidate's background. Reference specific things from their resume naturally.

Begin now.`;
  }

  // Standard mode
  const title = jobTitle || guessJobTitle(documents.jobDescription);
  return `You are ${interviewerName}, a senior interviewer conducting a real job interview for the position of "${title}".

Candidate profile:
RESUME:
${documents.resumeText || "(not provided)"}

COVER LETTER:
${documents.coverLetterText || "(not provided)"}

JOB DESCRIPTION:
${documents.jobDescription || "(not provided)"}

${CONFIG_BLOCK}

${SHARED_RULES}
- Reference specific things from their resume and cover letter naturally, by name.

Begin now.`;
}

/** Context block injected before each brain turn (latest vision read). */
export function formatVisionContext(latest: VisionAnalysis | null): string {
  if (!latest) return "(Director's note: candidate just settling in.)";
  const bits = [
    `eye contact ${latest.eyeContact}`,
    `posture ${latest.posture}`,
    `looks ${latest.expression}`,
  ];
  if (latest.presence === "absent") bits.push("NOT visible on camera right now");
  if (latest.gesture && latest.gesture !== "none") bits.push(`gesture: ${latest.gesture}`);
  if (latest.notes) bits.push(latest.notes);
  return `(Director's note — your own observation of the candidate: ${bits.join(", ")}.)`;
}

/* ──────────────────────────── Vision prompt ──────────────────────────────── */

export const VISION_SYSTEM_PROMPT =
  "You analyze single video frames of a job-interview candidate on a video call. You respond ONLY with a single minified JSON object, no prose, no code fences.";

export const VISION_USER_PROMPT = `Analyze this webcam frame of a job interview candidate. Respond with ONLY this JSON shape:
{"presence":"present|absent","eyeContact":"strong|moderate|weak|none","posture":"confident|neutral|slouched|tense","expression":"calm|nervous|confused|engaged|blank","presentation":"professional|casual|unprofessional","gesture":"none|waving|hand_raised|touching_face|looking_away|on_phone|shrugging","notes":"one short, specific observation if something is notable (e.g. 'smiling and nodding', 'glancing off-screen'), else null"}
Set presence to "absent" if no person is clearly in frame. Be honest and specific.`;

/* ─────────────────────────── Feedback prompt ─────────────────────────────── */

export const FEEDBACK_SYSTEM_PROMPT =
  "You are a rigorous, fair interview coach. You produce honest, specific, structured feedback. You respond ONLY with a single valid JSON object and nothing else — no prose, no code fences.";

export interface FeedbackPromptParams {
  transcript: TranscriptTurn[];
  visionAnalyses: VisionAnalysis[];
  config: InterviewConfig;
}

export function buildFeedbackUserPrompt({
  transcript,
  visionAnalyses,
  config,
}: FeedbackPromptParams): string {
  const convo = transcript
    .map(
      (t) => `${t.role === "interviewer" ? "INTERVIEWER" : "CANDIDATE"}: ${t.text}`
    )
    .join("\n");

  const visionSummary = summarizeVision(visionAnalyses);

  return `Below is the full transcript of a ${DIFFICULTY_LABELS[config.difficulty]} ${INTERVIEW_TYPE_LABELS[
    config.type
  ]} interview, plus an aggregate of vision reads taken every few seconds.

TRANSCRIPT:
${convo || "(empty)"}

VISION AGGREGATE:
${visionSummary}

Produce honest, specific feedback as a single JSON object with EXACTLY this shape and key names:
{
  "overallScore": <0-100 integer>,
  "grade": "<A+|A|A-|B+|B|B-|C+|C|C-|D|F>",
  "dimensions": {
    "communication": <0-100>,
    "technicalDepth": <0-100>,
    "confidence": <0-100>,
    "relevance": <0-100>,
    "structure": <0-100>
  },
  "answerAnnotations": [
    { "question": "<the interviewer question, shortened if long>", "answer": "<the candidate answer, shortened>", "quality": "strong|weak|missed", "annotation": "<one sharp sentence of coaching>" }
  ],
  "visionReport": {
    "eyeContactScore": <0-100>,
    "bodyLanguageSummary": "<2-3 sentences>",
    "presentationNotes": "<1-2 sentences>"
  },
  "topThreeImprovements": ["<action item>", "<action item>", "<action item>"],
  "strengths": ["<strength>", "<strength>"],
  "overallSummary": "<3-4 sentence honest summary>"
}

Rules: Score on the merits — do not inflate. Include one annotation per substantive candidate answer (max 8). Keep all strings free of newlines. Output ONLY the JSON.`;
}

function summarizeVision(analyses: VisionAnalysis[]): string {
  if (!analyses.length) return "(no vision data captured)";
  const tally = <T extends string>(key: keyof VisionAnalysis) => {
    const counts: Record<string, number> = {};
    for (const a of analyses) {
      const v = a[key];
      if (typeof v === "string") counts[v] = (counts[v] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}×${n}`)
      .join(", ");
  };
  const notes = analyses
    .map((a) => a.notes)
    .filter((n): n is string => !!n)
    .slice(-6);
  return [
    `frames: ${analyses.length}`,
    `eyeContact: ${tally("eyeContact")}`,
    `posture: ${tally("posture")}`,
    `expression: ${tally("expression")}`,
    `presentation: ${tally("presentation")}`,
    notes.length ? `notable: ${notes.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ─────────────────────────────── JSON helpers ────────────────────────────── */

/** Tolerantly extracts the first JSON object from a model response. */
export function extractJson<T>(text: string): T | null {
  if (!text) return null;
  let cleaned = text.trim();
  // strip ```json ... ``` fences if present
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fall back to the outermost {...}
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
