import { verifyPass as verifyPassRaw, type Member } from "./access";
import { byokEnabled, KEY_HEADERS, ownerKeys, visitorKeys, type ProviderKeys } from "./keys";

export const PASS_HEADER = "x-iq-pass";

/** Storage problems (e.g. no database configured) surface as a clear 503 instead of a blank 500. */
export class StoreUnavailable extends Error {}

async function verifyPass(token: string | null | undefined) {
  try {
    return await verifyPassRaw(token);
  } catch (err) {
    throw new StoreUnavailable((err as Error).message);
  }
}

export function storeFailure(err: unknown): Response {
  console.error("[store]", (err as Error).message);
  return fail(503, (err as Error).message.startsWith("No database") ? (err as Error).message : "The server's database is unavailable. Try again shortly.");
}

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
export async function authed(req: Request): Promise<{ member: Member } | { response: Response }> {
  let v;
  try {
    v = await verifyPass(req.headers.get(PASS_HEADER));
  } catch (err) {
    return { response: storeFailure(err) };
  }
  if (!v.ok) return { response: denied(v.reason) };
  return { member: v.member };
}

export async function adminOnly(req: Request): Promise<{ member: Member } | { response: Response }> {
  const r = await authed(req);
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

export async function caller(req: Request): Promise<Caller | { response: Response }> {
  const pass = req.headers.get(PASS_HEADER);
  if (pass) {
    let v;
    try {
      v = await verifyPass(pass);
    } catch (err) {
      return { response: storeFailure(err) };
    }
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
