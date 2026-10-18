/**
 * The scored report: honest, specific, and actionable.
 */
import { MODELS, S, structured } from "./claude";
import {
  DIFFICULTY_LABELS,
  DIMENSIONS,
  FORMAT_META,
  type CvMetrics,
  type DeliveryStats,
  type Grade,
  type InterviewConfig,
  type InterviewContext,
  type InterviewFeedback,
  type PracticeFormat,
  type PresenceEvent,
  type TranscriptTurn,
  type VisionAnalysis,
} from "../../types/interview";

const GRADES: Grade[] = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"];
const FORMATS: PracticeFormat[] = ["full", "drill", "behavioral", "technical", "pitch", "salary", "weakspot", "custom"];

const SCHEMA = S.obj({
  overallScore: S.int,
  grade: S.enum(GRADES),
  headline: S.str,
  summary: S.str,
  hiringSignal: S.enum(["strong_yes", "yes", "lean_yes", "lean_no", "no"]),
  hiringSignalReason: S.str,
  dimensions: S.obj(Object.fromEntries(DIMENSIONS.map((d) => [d, S.int]))),
  strengths: S.strArr,
  improvements: S.arr(S.obj({ title: S.str, detail: S.str, drill: S.str })),
  answers: S.arr(
    S.obj({
      question: S.str,
      answer: S.str,
      quality: S.enum(["strong", "solid", "weak", "missed"]),
      score: S.int,
      whatWorked: S.str,
      toImprove: S.str,
      strongerAnswer: S.str,
    })
  ),
  presence: S.obj({ score: S.nullable(S.int), summary: S.str }),
  nextSession: S.obj({ format: S.enum(FORMATS), focus: S.str, why: S.str }),
});

const SYSTEM = `You are an elite interview coach who has sat on hundreds of hiring panels. You write feedback that is honest, specific and kind — the way a mentor who wants the candidate to get the job would. You never inflate scores, and you never pad with generic advice: every point references what the candidate actually said.

Scoring rubric (0–100 for each dimension and overall):
- 90+: would impress at a top company for this level. 75–89: strong, hireable. 60–74: promising but with clear gaps. 40–59: significant gaps. <40: not yet ready.
- communication: clarity, concision, listening to the actual question.
- structure: logical flow; behavioral answers follow Situation → Task → Action → Result.
- relevance: answers address the question and connect to the target role.
- depth: specifics, numbers, trade-offs, ownership.
- confidence: conviction and composure, judged from wording (and camera metrics if present) — never from accent or grammar.

For "strongerAnswer": rewrite the candidate's answer as they could have said it — first person, their real experience (do not invent employers or facts; use [placeholders] for numbers they should fill in), 60–140 words, natural spoken style.
Write "headline" as one punchy sentence. "summary" is 3–4 sentences. Give 2–4 strengths and exactly 3 improvements, each with a concrete drill they can do in the next session. Review every substantive candidate answer (max 10), skipping small talk. Plain text in all strings, no markdown.`;

export interface FeedbackInput {
  apiKey: string;
  presence?: PresenceEvent[];
  transcript: TranscriptTurn[];
  config: InterviewConfig;
  context: InterviewContext;
  vision: VisionAnalysis[];
  cv: CvMetrics | null;
  delivery: DeliveryStats;
  candidateName?: string;
}

export async function generateFeedback(input: FeedbackInput): Promise<{ feedback: InterviewFeedback; costUsd: number }> {
  const { transcript, config, context, vision, cv, delivery } = input;
  const answered = transcript.filter((t) => t.role === "candidate" && t.text.trim().split(/\s+/).length > 3);
  if (answered.length === 0) {
    return { feedback: emptyFeedback(config, delivery, cv), costUsd: 0 };
  }

  const convo = transcript
    .map((t) => `${t.role === "interviewer" ? `INTERVIEWER${t.speaker ? ` (${t.speaker})` : ""}` : "CANDIDATE"}: ${t.text}`)
    .join("\n");

  const camera = cv
    ? `Camera metrics (measured on-device every frame): eye contact ${cv.eyeContactPct}% · on-screen ${cv.presentPct}% · blinks ${cv.blinksPerMin}/min (15–20 calm, 30+ nervous) · smiling ${cv.smilePct}% · head steadiness ${cv.headSteadiness}/100 · engagement ${cv.engagement}/100.`
    : "Camera metrics: not available (camera off). Set presence.score to null and say so briefly in presence.summary.";

  const moments = summarizePresence(input.presence ?? []);

  const snapshots = vision.length
    ? `Periodic visual impressions: ${vision
        .map((v) => `${v.eyeContact} eye contact, ${v.posture} posture, ${v.expression}${v.notes ? ` (${v.notes})` : ""}`)
        .join("; ")}.`
    : "";

  const user = `Session: ${FORMAT_META[config.format].label}, ${DIFFICULTY_LABELS[config.difficulty]} difficulty, ${config.inputMode === "voice" ? "spoken" : "typed"} answers.
Target role: ${context.role || "unspecified"}${context.company ? ` at ${context.company}` : ""}.
${context.notes ? `Candidate's focus/notes: ${context.notes}\n` : ""}${context.jobDescription ? `Job description (excerpt): ${context.jobDescription.slice(0, 3000)}\n` : ""}
Delivery (measured): ${delivery.answers} answers, avg ${delivery.avgAnswerWords} words${delivery.wpm ? `, ${delivery.wpm} words/min` : ""}, ${delivery.fillerCount} filler words (${delivery.fillerPer100} per 100 words)${delivery.topFillers.length ? `: ${delivery.topFillers.map((f) => `"${f.word}"×${f.count}`).join(", ")}` : ""}. Hints used: ${delivery.hintsUsed}.
${camera}
${snapshots}
${moments}

TRANSCRIPT:
${convo}

For nextSession, pick the single practice format that would help most next, with a one-line focus and why.`;

  try {
    const { data, costUsd } = await structured<InterviewFeedback>({
      apiKey: input.apiKey,
      model: MODELS.coach,
      system: SYSTEM,
      user,
      schema: SCHEMA,
      effort: "high",
    });
    if (data) return { feedback: { ...normalize(data, delivery, cv), presenceEvents: input.presence?.length ? input.presence : undefined }, costUsd };
    return { feedback: emptyFeedback(config, delivery, cv, true), costUsd };
  } catch (err) {
    console.warn("[feedback]", (err as Error).message);
    return { feedback: emptyFeedback(config, delivery, cv, true), costUsd: 0 };
  }
}

function summarizePresence(events: PresenceEvent[]): string {
  if (!events.length) return "";
  const counts = new Map<string, number>();
  for (const e of events) if (e.kind !== "returned" && e.kind !== "smiling") counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  if (!counts.size) return "";
  const label: Record<string, string> = {
    absent: "left the frame",
    hand_raised: "raised a hand",
    pointing: "pointed off-camera",
    phone: "used a phone",
    other_person: "another person appeared",
    looking_away: "looked away for a long stretch",
    confused: "looked unsure after a question",
  };
  return `On-camera moments (detected on-device): ${[...counts].map(([k, n]) => `${label[k] ?? k} ×${n}`).join(", ")}. Mention only what matters for a real interview, kindly.`;
}

const clamp = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
};

function normalize(fb: InterviewFeedback, delivery: DeliveryStats, cv: CvMetrics | null): InterviewFeedback {
  return {
    ...fb,
    overallScore: clamp(fb.overallScore),
    grade: GRADES.includes(fb.grade) ? fb.grade : "C",
    dimensions: Object.fromEntries(DIMENSIONS.map((d) => [d, clamp(fb.dimensions?.[d])])) as InterviewFeedback["dimensions"],
    answers: (fb.answers ?? []).slice(0, 10).map((a) => ({ ...a, score: clamp(a.score) })),
    strengths: (fb.strengths ?? []).slice(0, 4),
    improvements: (fb.improvements ?? []).slice(0, 3),
    presence: {
      score: cv && fb.presence?.score != null ? clamp(fb.presence.score) : null,
      summary: fb.presence?.summary ?? "",
    },
    delivery,
    liveMetrics: cv ?? undefined,
  };
}

function emptyFeedback(
  config: InterviewConfig,
  delivery: DeliveryStats,
  cv: CvMetrics | null,
  failed = false
): InterviewFeedback {
  return {
    overallScore: 0,
    grade: "F",
    headline: failed ? "We couldn't score this session." : "Not enough answers to score yet.",
    summary: failed
      ? "Your transcript was saved, but the scoring service didn't respond. You can retry scoring from this page."
      : "The session ended before you'd answered a question. That's completely fine — start another whenever you're ready.",
    hiringSignal: "lean_no",
    hiringSignalReason: "Not enough material to judge.",
    dimensions: { communication: 0, structure: 0, relevance: 0, depth: 0, confidence: 0 },
    strengths: [],
    improvements: [],
    answers: [],
    presence: { score: null, summary: "" },
    nextSession: { format: config.format === "full" ? "drill" : config.format, focus: "Warm up with a short session", why: "Short reps build momentum." },
    delivery,
    liveMetrics: cv ?? undefined,
  };
}

export function isUnscored(fb: InterviewFeedback): boolean {
  return fb.overallScore === 0 && fb.answers.length === 0;
}
