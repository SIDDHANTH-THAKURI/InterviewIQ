import { deleteMember, updateMember, type MemberPatch } from "@/lib/server/access";
import { adminOnly, body, fail, json } from "@/lib/server/http";
import { serializeMember } from "@/lib/server/members";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await adminOnly(req);
  if ("response" in r) return r.response;
  const { id } = await ctx.params;
  const out = await updateMember(id, await body<MemberPatch>(req));
  if (!out) return fail(404, "Not found, or not allowed for the owner account.");
  return json({ member: serializeMember(out.member, out.token) });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await adminOnly(req);
  if ("response" in r) return r.response;
  const { id } = await ctx.params;
  return (await deleteMember(id)) ? json({ ok: true }) : fail(404, "Not found, or not allowed for the owner account.");
}
