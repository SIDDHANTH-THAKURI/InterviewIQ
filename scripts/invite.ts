/**
 * Create an invite from the terminal.
 *
 *   npm run invite -- "Aarav" --minutes 120 --preps 10 --url https://your-app.example.com
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createInvite } from "../lib/server/access";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const name = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!name) {
  console.error('Usage: npm run invite -- "Name" [--minutes 120|none] [--preps 10|none] [--days 30] [--url https://…]');
  process.exit(1);
}
const limit = (v: string | undefined, d: number) => (v === "none" ? null : v ? Number(v) : d);

const { member, token } = createInvite({
  name,
  note: flag("note"),
  minutesPerMonth: limit(flag("minutes"), 120),
  prepsPerMonth: limit(flag("preps"), 10),
  expiresInDays: flag("days") ? Number(flag("days")) : null,
});
const base = (flag("url") || process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");
console.log(`\nInvite for ${member.name}:\n\n  ${base}/join/${token}\n`);
