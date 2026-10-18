import { verifyPass, type Member } from "./access";

export const PASS_HEADER = "x-iq-pass";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function fail(status: number, message: string, code?: string) {
  return json({ error: message, code }, status);
}

/** Resolves the caller's member record from their pass, or a 401 response. */
export function authed(req: Request): { member: Member } | { response: Response } {
  const v = verifyPass(req.headers.get(PASS_HEADER));
  if (!v.ok) {
    const message =
      v.reason === "revoked"
        ? "This invite has been turned off."
        : v.reason === "expired"
          ? "This invite has expired."
          : "You need a valid invite to use InterviewIQ.";
    return { response: fail(401, message, v.reason) };
  }
  return { member: v.member };
}

export function adminOnly(req: Request): { member: Member } | { response: Response } {
  const r = authed(req);
  if ("response" in r) return r;
  if (r.member.role !== "admin") return { response: fail(403, "Admins only.") };
  return r;
}

export async function body<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

export const ownerName = () => process.env.OWNER_NAME?.trim() || "A friend";
