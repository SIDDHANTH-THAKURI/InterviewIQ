import { adminPasscodeConfigured, loginAdmin } from "@/lib/server/access";
import { body, fail, json } from "@/lib/server/http";

const attempts = new Map<string, { n: number; until: number }>();

export async function POST(req: Request) {
  if (!adminPasscodeConfigured()) return fail(503, "Set ADMIN_PASSCODE in .env.local and restart the server.");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) return fail(429, "Too many attempts. Try again in a few minutes.");

  const { passcode } = await body<{ passcode: string }>(req);
  const pass = loginAdmin(String(passcode ?? ""));
  if (!pass) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(ip, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    return fail(401, "That passcode isn't right.");
  }
  attempts.delete(ip);
  return json({ pass });
}
