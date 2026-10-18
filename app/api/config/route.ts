import { byokEnabled } from "@/lib/server/keys";
import { json, ownerName } from "@/lib/server/http";

/** Public, non-secret settings the landing page needs. */
export async function GET() {
  return json({ byok: byokEnabled(), ownerName: ownerName() });
}
