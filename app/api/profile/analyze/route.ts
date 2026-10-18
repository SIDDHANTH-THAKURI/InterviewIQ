import { analyzeResume } from "@/lib/ai/prep";
import { recordUsage } from "@/lib/server/access";
import { authed, body, fail, json } from "@/lib/server/http";

export async function POST(req: Request) {
  const r = authed(req);
  if ("response" in r) return r.response;
  const { resumeText } = await body<{ resumeText: string }>(req);
  if (!resumeText || resumeText.trim().length < 80) return fail(400, "That resume looks empty.");
  try {
    const { insights, costUsd } = await analyzeResume(resumeText);
    recordUsage(r.member.id, { costUsd });
    if (!insights) return fail(502, "Couldn't read that resume. You can fill the details in yourself.");
    return json({ insights });
  } catch (err) {
    console.warn("[analyze]", (err as Error).message);
    return fail(502, "Couldn't read that resume right now.");
  }
}
