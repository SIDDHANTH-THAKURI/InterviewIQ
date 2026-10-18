import Anthropic from "@anthropic-ai/sdk";
import { generatePrepPack } from "@/lib/ai/prep";
import { recordUsage, remainingPreps } from "@/lib/server/access";
import { body, caller, fail, json } from "@/lib/server/http";

export const maxDuration = 300;

export async function POST(req: Request) {
  const c = caller(req);
  if ("response" in c) return c.response;
  if (c.kind === "invite") {
    const left = remainingPreps(c.member);
    if (left !== null && left < 1) {
      return fail(429, "You've used this month's prep packs. Ask the person who invited you for more.", "quota");
    }
  }
  const b = await body<{
    role: string;
    company: string;
    jobDescription: string;
    resumeText: string;
    experienceLevel: string;
    research: boolean;
  }>(req);
  if (!b.role?.trim()) return fail(400, "Which role are you preparing for?");
  try {
    const { pack, costUsd } = await generatePrepPack({
      apiKey: c.keys.anthropic,
      role: b.role.trim().slice(0, 120),
      company: b.company?.trim().slice(0, 120) || undefined,
      jobDescription: b.jobDescription,
      resumeText: b.resumeText,
      experienceLevel: b.experienceLevel,
      research: !!b.research,
    });
    if (c.kind === "invite") recordUsage(c.member.id, { costUsd, preps: pack ? 1 : 0 });
    if (!pack) return fail(502, "Couldn't build the prep pack. Please try again.");
    return json({ pack });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return fail(401, "Your Anthropic key was rejected. Check it in Profile → Your keys.", "bad-key");
    console.warn("[prep]", (err as Error).message);
    return fail(502, "Couldn't build the prep pack right now. Please try again.");
  }
}
