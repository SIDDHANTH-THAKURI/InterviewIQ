import { createInvite, listMembers } from "@/lib/server/access";
import { adminOnly, body, fail, json } from "@/lib/server/http";
import { serializeMember } from "@/lib/server/members";

export async function GET(req: Request) {
  const r = adminOnly(req);
  if ("response" in r) return r.response;
  return json({ members: listMembers().map(({ member, token }) => serializeMember(member, token)) });
}

const limit = (v: unknown, fallback: number | null) =>
  v === null ? null : Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : fallback;

export async function POST(req: Request) {
  const r = adminOnly(req);
  if ("response" in r) return r.response;
  const b = await body<{
    name: string;
    note: string;
    minutesPerMonth: number | null;
    prepsPerMonth: number | null;
    expiresInDays: number | null;
  }>(req);
  if (!b.name?.trim()) return fail(400, "Give the invite a name.");
  const { member, token } = createInvite({
    name: b.name,
    note: b.note,
    minutesPerMonth: limit(b.minutesPerMonth, 120),
    prepsPerMonth: limit(b.prepsPerMonth, 10),
    expiresInDays: b.expiresInDays ? Math.max(1, Number(b.expiresInDays)) : null,
  });
  return json({ member: serializeMember(member, token) }, 201);
}
