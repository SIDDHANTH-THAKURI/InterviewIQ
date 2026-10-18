import { verifyPass, type Member } from "./access";
import { byokEnabled, KEY_HEADERS, ownerKeys, visitorKeys, type ProviderKeys } from "./keys";

export const PASS_HEADER = "x-iq-pass";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function fail(status: number, message: string, code?: string) {
  return json({ error: message, code }, status);
}

function denied(reason: "invalid" | "revoked" | "expired"): Response {
  const message =
    reason === "revoked"
      ? "This invite has been turned off."
      : reason === "expired"
        ? "This invite has expired."
        : "You need a valid invite to use InterviewIQ.";
  return fail(401, message, reason);
}

/** Invite holders only (used by endpoints that only make sense for members). */
export function authed(req: Request): { member: Member } | { response: Response } {
  const v = verifyPass(req.headers.get(PASS_HEADER));
  if (!v.ok) return { response: denied(v.reason) };
  return { member: v.member };
}

export function adminOnly(req: Request): { member: Member } | { response: Response } {
  const r = authed(req);
  if ("response" in r) return r;
  if (r.member.role !== "admin") return { response: fail(403, "Admins only.") };
  return r;
}

/**
 * Who is calling, and whose keys this request may spend.
 *   • A valid invite pass → the owner's keys (member limits apply).
 *   • Otherwise, the visitor's own key from the request header — never the owner's.
 */
export type Caller = { kind: "invite"; member: Member; keys: ProviderKeys } | { kind: "byok"; keys: ProviderKeys };

export function caller(req: Request): Caller | { response: Response } {
  const pass = req.headers.get(PASS_HEADER);
  if (pass) {
    const v = verifyPass(pass);
    if (!v.ok) return { response: denied(v.reason) };
    const keys = ownerKeys();
    if (!keys.anthropic) return { response: fail(503, "The server owner hasn't configured an Anthropic key yet.") };
    return { kind: "invite", member: v.member, keys };
  }
  if (!byokEnabled()) return { response: denied("invalid") };
  const keys = visitorKeys({ anthropic: req.headers.get(KEY_HEADERS.anthropic) });
  if (!keys) return { response: fail(401, "Add your Anthropic API key, or open an invite link.", "no-keys") };
  return { kind: "byok", keys };
}

export async function body<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

export const ownerName = () => process.env.OWNER_NAME?.trim() || "A friend";
