import { toAccessInfo, touch } from "@/lib/server/access";
import { authed, json, ownerName } from "@/lib/server/http";

/** Validates the caller's pass and returns who they are + this month's usage. */
export async function GET(req: Request) {
  const r = await authed(req);
  if ("response" in r) return r.response;
  await touch(r.member);
  return json({ access: toAccessInfo(r.member), ownerName: ownerName() });
}
