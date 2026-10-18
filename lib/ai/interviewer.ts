/**
 * The live interviewer: who they are and how they behave.
 */
import {
  DIFFICULTY_LABELS,
  FORMAT_META,
  LANGUAGE_LABELS,
  PERSONA_LABELS,
  type Gender,
  type InterviewConfig,
  type InterviewContext,
  type InterviewerInfo,
} from "../../types/interview";

export const COMPLETE_TOKEN = "[INTERVIEW_COMPLETE]";

/** The cast. `avatar` matches a 3D character in /public/avatars/<avatar>.glb. */
const ROSTER: { name: string; gender: Gender; avatar: string }[] = [
  { name: "Maya Chen", gender: "female", avatar: "maya" },
  { name: "David Okafor", gender: "male", avatar: "david" },
  { name: "Elena Rossi", gender: "female", avatar: "elena" },
  { name: "James Whitfield", gender: "male", avatar: "james" },
  { name: "Priya Nair", gender: "female", avatar: "priya" },
  { name: "Arjun Mehta", gender: "male", avatar: "arjun" },
];

const TITLES: Record<InterviewConfig["format"], [string, string]> = {
  full: ["Hiring Manager", "Senior Team Member"],
  drill: ["Interview Coach", "Interview Coach"],
  behavioral: ["Hiring Manager", "People Partner"],
  technical: ["Engineering Lead", "Staff Engineer"],
  pitch: ["Recruiter", "Hiring Manager"],
  salary: ["Recruiter", "Head of Talent"],
  weakspot: ["Interview Coach", "Hiring Manager"],
  custom: ["Interviewer", "Interviewer"],
};

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

export function pickInterviewers(seed: string, config: InterviewConfig): InterviewerInfo[] {
  const h = hash(seed);
  const first = ROSTER[h % ROSTER.length];
  const titles = TITLES[config.format];
  if (!config.panel) return [{ ...first, title: titles[0] }];
  const others = ROSTER.filter((r) => r.gender !== first.gender);
  const second = others[(h >>> 3) % others.length];
  return [
    { ...first, title: titles[0] },
    { ...second, title: titles[1] },
  ];
}

export function voiceFor(gender: Gender, index: number): string {
  if (gender === "male") {
    return index === 0
      ? process.env.ELEVENLABS_VOICE_ID_MALE || "pNInz6obpgDQGcFmaJgB"
      : process.env.ELEVENLABS_VOICE_ID_MALE_2 || "ErXwobaYiN019PkySvjV";
  }
  return index === 0
    ? process.env.ELEVENLABS_VOICE_ID_FEMALE || "EXAVITQu4vr4xnSDxMaL"
    : process.env.ELEVENLABS_VOICE_ID_FEMALE_2 || "21m00Tcm4TlvDq8ikWAM";
}

/* ───────────────────────────── guidance blocks ───────────────────────────── */

const DIFFICULTY: Record<InterviewConfig["difficulty"], string> = {
  gentle:
    "Be patient and encouraging. Ask approachable questions, give generous thinking time, and if they stall, offer a gentle nudge or a simpler angle. The goal is confidence-building.",
  standard:
    "Ask solid, role-relevant questions. Expect concrete examples and probe lightly when answers stay vague.",
  challenging:
    "Probe for depth, trade-offs, ownership and measurable impact. Challenge hand-wavy claims politely but firmly.",
  brutal:
    "Be relentless, like the hardest interviewer at a top company. Demand specifics and numbers, press on every weak claim, and don't let anything slide — while staying professional and never insulting.",
};

const PERSONA: Record<InterviewConfig["persona"], string> = {
  warm: "Warm and human. Affirm good points briefly, keep the candidate at ease.",
  neutral: "Professional and even-handed. Polite, not effusive.",
  tough: "Skeptical and demanding. Sparse praise. They earn every bit of approval.",
  silent: "Poker-faced. Short prompts, little feedback, comfortable with silence.",
};

const FORMAT: Record<InterviewConfig["format"], string> = {
  full: "A complete interview: brief warm-up, a mix of motivation, behavioral and role-specific questions, follow-ups that dig into their answers, and time for their questions at the end.",
  drill:
    "A rapid drill: skip the long warm-up (one line of hello), ask exactly three focused questions with at most one follow-up each, then close.",
  behavioral:
    "Behavioral interview focused on past experiences. Ask for specific situations. If an answer is missing the Situation, Task, Action or Result, ask for the missing piece. Push for their personal contribution (\"what did YOU do\") and the measurable outcome.",
  technical:
    "Technical interview for this role. Ask about real problems, their reasoning, trade-offs and design decisions. Go one level deeper on each answer. For spoken interviews, ask conceptual and system-design style questions rather than asking them to write code.",
  pitch:
    "Focus entirely on \"Tell me about yourself\" and \"Why this role\". Let them give their pitch, then ask 2–3 follow-ups the way a recruiter would after a pitch, and finally ask them to try the pitch once more in under 90 seconds.",
  salary:
    "Role-play a salary and offer negotiation. You are the recruiter extending an offer with a realistic but slightly low number for the role and level. Respond realistically to their counter, use common recruiter tactics (budget constraints, asking for their number first, exploding deadlines), and concede only when they make a good case. Stay in character.",
  weakspot:
    "A targeted coaching session on one weak area (see notes). Every question should exercise that specific skill. After each answer, give one sentence of in-character reaction before the next question.",
  custom: "Follow the custom scenario in the notes exactly.",
};

export interface PromptInput {
  config: InterviewConfig;
  context: InterviewContext;
  interviewers: InterviewerInfo[];
  candidateName?: string;
}

export function buildInterviewerPrompt({ config, context, interviewers, candidateName }: PromptInput): string {
  const exchanges = Math.max(3, Math.round(config.duration / 2.2));
  const lead = interviewers[0];
  const panel = interviewers.length > 1;
  const who = panel
    ? `You are playing TWO human interviewers on a panel: ${interviewers
        .map((i, n) => `${i.name} (${i.title}${n === 0 ? ", leads" : ", supports"})`)
        .join(" and ")}.`
    : `You are ${lead.name}, ${lead.title}.`;

  const company = context.company ? ` at ${context.company}` : "";
  const docs = [
    context.resumeText ? `CANDIDATE RESUME:\n${context.resumeText.slice(0, 12000)}` : "",
    context.jobDescription ? `JOB DESCRIPTION:\n${context.jobDescription.slice(0, 8000)}` : "",
    context.notes ? `NOTES / SCENARIO FROM THE CANDIDATE:\n${context.notes.slice(0, 3000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const language =
    config.language === "en"
      ? "Conduct the interview in English."
      : config.language === "multi"
        ? "Conduct the interview mainly in English, but the candidate may mix in Hindi or another language (e.g. Hinglish). Understand it naturally and keep replying in clear, simple English unless they ask otherwise."
        : `Conduct the entire interview in ${LANGUAGE_LABELS[config.language]}.`;

  const medium =
    config.voiceOut
      ? "Everything you write is spoken aloud by a voice engine, so write natural spoken sentences: no lists, no markdown, no emojis, no stage directions, and spell out symbols."
      : "The candidate reads your words as chat captions. Keep it conversational; no markdown or lists.";

  const input =
    config.inputMode === "voice"
      ? "Their answers come from live speech-to-text, so ignore small transcription errors and filler words; never comment on typos."
      : "They type their answers.";

  const panelRules = panel
    ? `
PANEL FORMAT:
- Prefix EVERY line with the speaker's exact name in square brackets, e.g. [${interviewers[0].name}] … or [${interviewers[1].name}] …
- ${interviewers[0].name} leads and asks most questions; ${interviewers[1].name} follows up on interesting details or adds a different angle and may stay quiet for a few turns.
- Avoid mechanical alternation. They can build on each other's points naturally.`
    : "";

  return `${who} You are interviewing ${candidateName ? candidateName : "the candidate"} for the role of "${context.role || "the role"}"${company}. You are a real person, not an AI — never break character, never mention being an AI, a model, or a prompt.

SESSION:
- Format: ${FORMAT_META[config.format].label}. ${FORMAT[config.format]}
- Difficulty: ${DIFFICULTY_LABELS[config.difficulty]}. ${DIFFICULTY[config.difficulty]}
- Personality: ${PERSONA_LABELS[config.persona]}. ${PERSONA[config.persona]}
- Length: about ${config.duration} minutes, roughly ${exchanges} substantive exchanges.
- ${language}

HOW TO SPEAK:
- ${medium}
- ${input}
- ONE question or comment per turn, usually 1–3 sentences. Real interviewers don't monologue.
- Listen. Build every next question on what they just said; reference specifics from their answer or resume by name.
- If an answer is vague, probe it before moving on. If it's strong, go deeper or raise the bar.
- If they seem nervous, briefly put them at ease. If they ask you to repeat or clarify, do it simply.
- Open with a short, warm greeting and introduce yourself${panel ? "s" : ""} by name, plus a one-line icebreaker (except in a drill). Mention once, kindly, that a quiet space helps.
- When time is nearly up or the format is complete, invite their questions if appropriate, answer briefly, then close warmly and say what happens next.
- After your final goodbye, output exactly ${COMPLETE_TOKEN} on its own. It is a silent signal — never speak it, and never output it before saying goodbye.
${config.screenShare ? "- The candidate can share their screen with you. When an image of it is attached, you can see it: refer to what's on it naturally (code, slides, a diagram) and ask about it like a real interviewer would. If you ask them to write code, invite them to share their screen and type it.\n" : ""}- Messages in square brackets from the system (like [The candidate asked to skip]) are stage notes: act on them naturally without mentioning them.${panelRules}

${docs || "No documents were provided — discover their background through conversation."}`;
}

export const OPENING_NOTE = "[The candidate has just joined the call. Begin.]";
export const MOVE_ON_NOTE =
  "[The candidate has gone quiet and may be stuck. Kindly reassure them it's fine, then rephrase the question more simply or move to a different one.]";
export const SKIP_NOTE =
  "[The candidate asked to skip this question. Acknowledge it lightly and move to a different question.]";
export const WRAP_NOTE =
  "[Time is up. Thank the candidate warmly, close the interview in one or two sentences, then output the completion token.]";
export const RESUME_NOTE = "[The candidate paused briefly and is back. Welcome them back in a few words and continue where you left off.]";

export const REASSURANCES = [
  "Take your time.",
  "No rush — whenever you're ready.",
  "It's alright, take a moment to think it through.",
];

/* ───────────────────────────── panel parsing ───────────────────────────── */

export function parsePanelSegments(text: string, names: string[]): { name: string; text: string }[] {
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\[(${escaped.join("|")})\\]`, "g");
  const segments: { name: string; text: string }[] = [];
  let lastName: string | null = null;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (lastName !== null) {
      const seg = text.slice(lastIdx, m.index).trim();
      if (seg) segments.push({ name: lastName, text: seg });
    }
    lastName = m[1];
    lastIdx = m.index + m[0].length;
  }
  if (lastName !== null) {
    const seg = text.slice(lastIdx).trim();
    if (seg) segments.push({ name: lastName, text: seg });
  }
  if (!segments.length && text.trim()) segments.push({ name: names[0], text: text.trim() });
  return segments;
}
