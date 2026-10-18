import { generatePrepPack } from "@/lib/ai/prep";
import { recordUsage, remainingPreps } from "@/lib/server/access";
import { authed, body, fail, json } from "@/lib/server/http";

export const maxDuration = 300;

export async function POST(req: Request) {
  const r = authed(req);
  if ("response" in r) return r.response;
  const left = remainingPreps(r.member);
  if (left !== null && left < 1) {
    return fail(429, "You've used this month's prep packs. Ask the person who invited you for more.", "quota");
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
      role: b.role.trim().slice(0, 120),
      company: b.company?.trim().slice(0, 120) || undefined,
      jobDescription: b.jobDescription,
      resumeText: b.resumeText,
      experienceLevel: b.experienceLevel,
      research: !!b.research,
    });
    recordUsage(r.member.id, { costUsd, preps: pack ? 1 : 0 });
    if (!pack) return fail(502, "Couldn't build the prep pack. Please try again.");
    return json({ pack });
  } catch (err) {
    console.warn("[prep]", (err as Error).message);
    return fail(502, "Couldn't build the prep pack right now. Please try again.");
  }
}
