import Anthropic from "@anthropic-ai/sdk";
import { byokEnabled, visitorKeys } from "@/lib/server/keys";
import { body, fail, json } from "@/lib/server/http";

type Result = { ok: boolean; message: string } | null;

/**
 * Checks visitor-supplied keys with each provider using cheap read-only calls.
 * Keys are used for this request only and never stored or logged.
 */
export async function POST(req: Request) {
  if (!byokEnabled()) return fail(403, "Bring-your-own-keys is turned off on this server.");
  const b = await body<{ anthropic: string; elevenlabs: string; deepgram: string }>(req);
  const keys = visitorKeys(b);
  if (!keys) return fail(400, "That Anthropic key doesn't look right.");

  const [anthropic, elevenlabs, deepgram] = await Promise.all([
    testAnthropic(keys.anthropic),
    keys.elevenlabs ? testElevenLabs(keys.elevenlabs) : Promise.resolve<Result>(null),
    keys.deepgram ? testDeepgram(keys.deepgram) : Promise.resolve<Result>(null),
  ]);
  return json({ anthropic, elevenlabs, deepgram });
}

async function testAnthropic(apiKey: string): Promise<Result> {
  try {
    await new Anthropic({ apiKey, maxRetries: 0, timeout: 15000 }).models.list({ limit: 1 });
    return { ok: true, message: "Connected" };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, message: "Key was rejected" };
    if (err instanceof Anthropic.PermissionDeniedError) return { ok: false, message: "Key lacks permission" };
    return { ok: false, message: "Couldn't reach Anthropic — try again" };
  }
}

async function testElevenLabs(key: string): Promise<Result> {
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/models", {
      headers: { "xi-api-key": key },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return { ok: true, message: "Connected" };
    if (res.status === 401) return { ok: false, message: "Key was rejected" };
    // Restricted keys may not be allowed to list models but can still speak.
    return { ok: true, message: "Accepted (limited permissions)" };
  } catch {
    return { ok: false, message: "Couldn't reach ElevenLabs — try again" };
  }
}

async function testDeepgram(key: string): Promise<Result> {
  try {
    const res = await fetch("https://api.deepgram.com/v1/projects", {
      headers: { Authorization: `Token ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return { ok: true, message: "Connected" };
    if (res.status === 401) return { ok: false, message: "Key was rejected" };
    return { ok: true, message: "Accepted (limited permissions)" };
  } catch {
    return { ok: false, message: "Couldn't reach Deepgram — try again" };
  }
}
