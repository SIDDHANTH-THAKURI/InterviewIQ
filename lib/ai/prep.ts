/**
 * Prep packs (tailored question bank + story bank) and other coaching calls.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, FALLBACK_BETA, MODELS, S, structured } from "./claude";
import { claudeCost } from "../server/pricing";
import type { PrepPack } from "../../types/interview";

const PREP_SCHEMA = S.obj({
  role: S.str,
  company: S.nullable(S.str),
  snapshot: S.str,
  whatTheyWant: S.strArr,
  yourEdge: S.strArr,
  gaps: S.arr(S.obj({ gap: S.str, howToAddress: S.str })),
  questions: S.arr(
    S.obj({
      question: S.str,
      category: S.str,
      whyTheyAsk: S.str,
      answerOutline: S.strArr,
      useStory: S.nullable(S.str),
    })
  ),
  stories: S.arr(
    S.obj({
      title: S.str,
      situation: S.str,
      task: S.str,
      action: S.str,
      result: S.str,
      goodFor: S.strArr,
    })
  ),
  questionsToAsk: S.strArr,
  companyNotes: S.nullable(S.strArr),
  dayOfChecklist: S.strArr,
});

const PREP_SYSTEM = `You are a world-class interview coach preparing a candidate for a specific interview. You are practical and specific: everything you write is tailored to THIS role and THIS candidate's real background. Never invent facts about the candidate; where a number or detail is missing, write a [placeholder] they should fill in. Plain text only, no markdown.

Produce:
- snapshot: 2–3 sentences on what this interview will likely test and how the candidate should position themselves.
- whatTheyWant: 4–6 things the employer is really screening for.
- yourEdge: 3–5 genuine advantages from the candidate's background, each tied to evidence in their resume.
- gaps: 2–4 likely concerns an interviewer may have, with an honest way to address each.
- questions: 12–15 likely questions across categories (Motivation, Behavioral, Role-specific, Technical/Craft, Curveball). answerOutline = 3–5 short bullet beats. useStory = title of the best-fitting story from your stories list, or null.
- stories: 4–6 STAR stories built from the candidate's real experience. Keep each field 1–2 sentences.
- questionsToAsk: 5 sharp questions the candidate can ask the interviewer.
- companyNotes: key facts from the research notes if provided, else null.
- dayOfChecklist: 6–8 short, practical items for the day of the interview.`;

export interface PrepInput {
  apiKey: string;
  role: string;
  company?: string;
  jobDescription?: string;
  resumeText?: string;
  experienceLevel?: string;
  research: boolean;
}

export async function generatePrepPack(input: PrepInput): Promise<{ pack: PrepPack | null; costUsd: number }> {
  let costUsd = 0;
  let notes = "";
  if (input.research && input.company) {
    const r = await researchCompany(input.apiKey, input.company, input.role);
    notes = r.notes;
    costUsd += r.costUsd;
  }

  const user = `TARGET ROLE: ${input.role}${input.company ? `\nCOMPANY: ${input.company}` : ""}${
    input.experienceLevel ? `\nCANDIDATE LEVEL: ${input.experienceLevel}` : ""
  }

JOB DESCRIPTION:
${input.jobDescription?.slice(0, 10000) || "(not provided — infer a typical description for this role)"}

CANDIDATE RESUME:
${input.resumeText?.slice(0, 14000) || "(not provided — keep stories generic with [placeholders])"}
${notes ? `\nCOMPANY RESEARCH NOTES (from a web search just now):\n${notes}` : ""}`;

  const { data, costUsd: c } = await structured<PrepPack>({
    apiKey: input.apiKey,
    model: MODELS.coach,
    system: PREP_SYSTEM,
    user,
    schema: PREP_SCHEMA,
    effort: "medium",
  });
  costUsd += c;
  if (data) {
    data.company = data.company || input.company || undefined;
    data.companyNotes = data.companyNotes ?? undefined;
    data.questions = data.questions.map((q) => ({ ...q, useStory: q.useStory ?? undefined }));
  }
  return { pack: data, costUsd };
}

async function researchCompany(apiKey: string, company: string, role: string): Promise<{ notes: string; costUsd: number }> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Research "${company}" for someone interviewing for a "${role}" role. Find: what the company does and its products, recent news or launches (last 12 months), stated values/culture, interview process tips if public, and anything relevant to this role. Run several focused searches (company overview, recent news, culture/values, interview experiences). Then reply with 8–12 concise factual bullet points (plain "- " lines), each with the source domain in parentheses. Only include facts you found; no commentary about the search itself. If the company is ambiguous or unknown, say so in one line.`,
    },
  ];
  let costUsd = 0;
  try {
    for (let i = 0; i < 3; i++) {
      const msg = await anthropic(apiKey)
        .beta.messages.stream({
          model: MODELS.research,
          max_tokens: 8000,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          output_config: { effort: "medium" },
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
          messages,
        })
        .finalMessage();
      costUsd += claudeCost(msg.model || MODELS.research, msg.usage);
      if (msg.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: msg.content });
        continue;
      }
      const text = msg.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return { notes: text.slice(0, 5000), costUsd };
    }
  } catch (err) {
    console.warn("[research]", (err as Error).message);
  }
  return { notes: "", costUsd };
}

/* ───────────────────────────── resume → profile ───────────────────────────── */

export interface ResumeInsights {
  name: string | null;
  headline: string;
  summary: string;
  skills: string[];
  suggestedRole: string;
  experienceLevel: "student" | "entry" | "mid" | "senior" | "lead" | "career-change";
}

export async function analyzeResume(
  apiKey: string,
  resumeText: string
): Promise<{ insights: ResumeInsights | null; costUsd: number }> {
  const { data, costUsd } = await structured<ResumeInsights>({
    apiKey,
    model: MODELS.fast,
    effort: "low",
    maxTokens: 4000,
    system:
      "You extract a concise professional profile from a resume. Be factual; never invent. Plain text only.",
    user: `Resume:\n${resumeText.slice(0, 14000)}\n\nReturn: name (or null), headline (one line, e.g. "Backend engineer · 4 yrs · fintech"), summary (2 sentences, second person: "You…"), skills (8–12 key skills), suggestedRole (the most natural next role title), experienceLevel.`,
    schema: S.obj({
      name: S.nullable(S.str),
      headline: S.str,
      summary: S.str,
      skills: S.strArr,
      suggestedRole: S.str,
      experienceLevel: S.enum(["student", "entry", "mid", "senior", "lead", "career-change"]),
    }),
  });
  return { insights: data, costUsd };
}

/* ───────────────────────────── live coach hint ───────────────────────────── */

export async function coachHint({
  apiKey,
  question,
  partialAnswer,
  role,
  resumeText,
}: {
  apiKey: string;
  question: string;
  partialAnswer: string;
  role: string;
  resumeText?: string;
}): Promise<{ hint: string; costUsd: number }> {
  try {
    const msg = await anthropic(apiKey).messages.create({
      model: MODELS.fast,
      max_tokens: 1500,
      output_config: { effort: "low" },
      system:
        "You are a calm, private interview coach whispering to a candidate mid-interview. Give a hint, not a script: 2–3 short lines — what the question is really testing, a structure to use, and one specific example from their background worth mentioning. Max 55 words. Plain text, no markdown, no preamble.",
      messages: [
        {
          role: "user",
          content: `Role: ${role}\nInterviewer just asked: "${question}"\n${partialAnswer ? `They've started answering: "${partialAnswer.slice(-600)}"\n` : ""}${resumeText ? `Their background (excerpt): ${resumeText.slice(0, 4000)}` : ""}`,
        },
      ],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return { hint: text, costUsd: claudeCost(MODELS.fast, msg.usage) };
  } catch (err) {
    console.warn("[hint]", (err as Error).message);
    return { hint: "", costUsd: 0 };
  }
}
