import { analyzeResume } from "@/lib/ai/prep";
import { recordUsage } from "@/lib/server/access";
import { body, caller, fail, json } from "@/lib/server/http";

export async function POST(req: Request) {
  const c = caller(req);
  if ("response" in c) return c.response;
  const { resumeText } = await body<{ resumeText: string }>(req);
  if (!resumeText || resumeText.trim().length < 80) return fail(400, "That resume looks empty.");
  try {
    const { insights, costUsd } = await analyzeResume(c.keys.anthropic, resumeText);
    if (c.kind === "invite") recordUsage(c.member.id, { costUsd });
    if (!insights) return fail(502, "Couldn't read that resume. You can fill the details in yourself.");
    return json({ insights });
  } catch (err) {
    console.warn("[analyze]", (err as Error).message);
    return fail(502, "Couldn't read that resume right now.");
  }
}
