import { toAccessInfo, touch } from "@/lib/server/access";
import { authed, json, ownerName } from "@/lib/server/http";

/** Validates the caller's pass and returns who they are + this month's usage. */
export async function GET(req: Request) {
  const r = authed(req);
  if ("response" in r) return r.response;
  touch(r.member.id);
  return json({ access: toAccessInfo(r.member), ownerName: ownerName() });
}
