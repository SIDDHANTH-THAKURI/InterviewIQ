import { computeDelivery } from "@/lib/ai/delivery";
import { generateFeedback } from "@/lib/ai/feedback";
import { recordUsage } from "@/lib/server/access";
import { body, caller, fail, json } from "@/lib/server/http";
import type { CvMetrics, InterviewConfig, InterviewContext, TranscriptTurn } from "@/types/interview";

export const maxDuration = 300;

/** Re-scores a saved transcript (used when a session ended before its report arrived). */
export async function POST(req: Request) {
  const c = caller(req);
  if ("response" in c) return c.response;
  const b = await body<{
    transcript: TranscriptTurn[];
    config: InterviewConfig;
    context: InterviewContext;
    cv: CvMetrics | null;
    hintsUsed: number;
  }>(req);
  if (!Array.isArray(b.transcript) || !b.config || !b.context) return fail(400, "Missing transcript.");
  const transcript = b.transcript.slice(0, 200).map((t) => ({ ...t, text: String(t.text).slice(0, 4000) }));
  const { feedback, costUsd } = await generateFeedback({
    apiKey: c.keys.anthropic,
    transcript,
    config: b.config,
    context: b.context,
    vision: [],
    cv: b.cv ?? null,
    delivery: computeDelivery(transcript, Number(b.hintsUsed) || 0),
  });
  if (c.kind === "invite") recordUsage(c.member.id, { costUsd });
  return json({ feedback });
}
