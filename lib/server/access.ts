/**
 * Invite-only access control.
 *
 * There is no user database. The owner hands out signed invite links; each link
 * IS the member's pass (an HMAC-signed token). The store (lib/server/store.ts)
 * keeps each member's name, limits, usage counters and revocation state —
 * never any interview content, which stays in the member's own browser.
 */
import crypto from "node:crypto";
import { store } from "./store";
import type { AccessInfo } from "../../types/interview";

export interface MonthUsage {
  minutes: number;
  preps: number;
  sessions: number;
  costUsd: number;
}

export interface Member {
  id: string;
  name: string;
  note?: string;
  role: "admin" | "member";
  createdAt: number;
  /** Bumped to invalidate previously issued links. */
  version: number;
  revoked: boolean;
  expiresAt: number | null;
  limits: { minutesPerMonth: number | null; prepsPerMonth: number | null };
  /** Loaded alongside the member: month key → counters. */
  usage: Record<string, MonthUsage>;
  lastSeenAt: number | null;
}

const OWNER_ID = "owner";
const K = {
  member: (id: string) => `iq:member:${id}`,
  members: "iq:members",
  usage: (id: string, month: string) => `iq:usage:${id}:${month}`,
  months: (id: string) => `iq:months:${id}`,
};

/* ───────────────────────────── secret ───────────────────────────── */

let cachedSecret: Buffer | null = null;

async function secret(): Promise<Buffer> {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.APP_SECRET?.trim();
  if (fromEnv) return (cachedSecret = Buffer.from(fromEnv, "utf8"));
  // No APP_SECRET: generate one once and keep it in the store, so links stay
  // valid across restarts. Setting APP_SECRET explicitly is still recommended.
  const kv = store();
  let s = await kv.get("iq:secret");
  if (!s) {
    s = crypto.randomBytes(48).toString("base64url");
    await kv.set("iq:secret", s);
  }
  return (cachedSecret = Buffer.from(s, "utf8"));
}

/* ───────────────────────────── members ───────────────────────────── */

const emptyUsage = (): MonthUsage => ({ minutes: 0, preps: 0, sessions: 0, costUsd: 0 });

async function loadUsage(id: string): Promise<Record<string, MonthUsage>> {
  const kv = store();
  const months = await kv.smembers(K.months(id));
  const entries = await Promise.all(
    months.map(async (m) => {
      const h = await kv.hgetall(K.usage(id, m));
      return [
        m,
        {
          minutes: round2(Number(h.minutes) || 0),
          preps: Math.round(Number(h.preps) || 0),
          sessions: Math.round(Number(h.sessions) || 0),
          costUsd: round4(Number(h.costUsd) || 0),
        },
      ] as const;
    })
  );
  return Object.fromEntries(entries);
}

async function getMember(id: string): Promise<Member | null> {
  const raw = await store().get(K.member(id));
  if (!raw) return id === OWNER_ID ? ensureOwner() : null;
  return { ...(JSON.parse(raw) as Member), usage: await loadUsage(id) };
}

async function saveMember(m: Member) {
  const { usage: _usage, ...rest } = m;
  void _usage;
  const kv = store();
  await kv.set(K.member(m.id), JSON.stringify(rest));
  await kv.sadd(K.members, m.id);
}

async function ensureOwner(): Promise<Member> {
  const raw = await store().get(K.member(OWNER_ID));
  if (raw) return { ...(JSON.parse(raw) as Member), usage: await loadUsage(OWNER_ID) };
  const owner: Member = {
    id: OWNER_ID,
    name: process.env.OWNER_NAME || "Owner",
    role: "admin",
    createdAt: Date.now(),
    version: 1,
    revoked: false,
    expiresAt: null,
    limits: { minutesPerMonth: null, prepsPerMonth: null },
    usage: {},
    lastSeenAt: null,
  };
  await saveMember(owner);
  return owner;
}

/* ───────────────────────────── tokens ───────────────────────────── */

interface TokenPayload {
  sub: string;
  v: number;
}

async function sign(data: string): Promise<string> {
  return crypto.createHmac("sha256", await secret()).update(data).digest("base64url");
}

export async function issueToken(member: Pick<Member, "id" | "version">): Promise<string> {
  const body = Buffer.from(JSON.stringify({ sub: member.id, v: member.version } satisfies TokenPayload)).toString("base64url");
  return `${body}.${await sign(body)}`;
}

async function decodeToken(token: string): Promise<TokenPayload | null> {
  const [body, mac] = (token || "").trim().split(".");
  if (!body || !mac) return null;
  const a = Buffer.from(mac);
  const b = Buffer.from(await sign(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    return typeof p.sub === "string" && typeof p.v === "number" ? p : null;
  } catch {
    return null;
  }
}

export type VerifyResult = { ok: true; member: Member } | { ok: false; reason: "invalid" | "revoked" | "expired" };

export async function verifyPass(token: string | null | undefined): Promise<VerifyResult> {
  const p = token ? await decodeToken(token) : null;
  if (!p) return { ok: false, reason: "invalid" };
  const m = await getMember(p.sub);
  if (!m || m.version !== p.v) return { ok: false, reason: "invalid" };
  if (m.revoked) return { ok: false, reason: "revoked" };
  if (m.expiresAt && Date.now() > m.expiresAt) return { ok: false, reason: "expired" };
  return { ok: true, member: m };
}

/* ───────────────────────────── admin login ───────────────────────────── */

export function adminPasscodeConfigured(): boolean {
  return !!process.env.ADMIN_PASSCODE?.trim();
}

export async function loginAdmin(passcode: string): Promise<string | null> {
  const expected = process.env.ADMIN_PASSCODE?.trim();
  if (!expected) return null;
  const a = crypto.createHash("sha256").update(passcode.trim()).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) return null;
  return issueToken(await ensureOwner());
}

/* ───────────────────────────── usage + quota ───────────────────────────── */

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function currentUsage(m: Member): MonthUsage {
  return { ...emptyUsage(), ...(m.usage[monthKey()] ?? {}) };
}

/** Atomic counter increments, so parallel requests never lose usage. */
export async function recordUsage(id: string, delta: Partial<MonthUsage>): Promise<void> {
  const kv = store();
  const month = monthKey();
  await kv.sadd(K.months(id), month);
  await Promise.all(
    (Object.entries(delta) as [keyof MonthUsage, number][])
      .filter(([, v]) => v)
      .map(([field, v]) => kv.hincrbyfloat(K.usage(id, month), field, v))
  );
}

/** Records "last seen", at most every few minutes to keep writes rare. */
export async function touch(m: Member): Promise<void> {
  if (m.lastSeenAt && Date.now() - m.lastSeenAt < 5 * 60_000) return;
  await saveMember({ ...m, lastSeenAt: Date.now() });
}

/** Minutes the member may still spend this month (null = unlimited). */
export function remainingMinutes(m: Member): number | null {
  if (m.limits.minutesPerMonth == null) return null;
  return Math.max(0, m.limits.minutesPerMonth - currentUsage(m).minutes);
}

export function remainingPreps(m: Member): number | null {
  if (m.limits.prepsPerMonth == null) return null;
  return Math.max(0, m.limits.prepsPerMonth - currentUsage(m).preps);
}

export function toAccessInfo(m: Member): AccessInfo {
  return { id: m.id, name: m.name, role: m.role, limits: m.limits, usage: currentUsage(m) };
}

/* ───────────────────────────── invites (admin) ───────────────────────────── */

export interface InviteInput {
  name: string;
  note?: string;
  minutesPerMonth: number | null;
  prepsPerMonth: number | null;
  expiresInDays: number | null;
}

export async function createInvite(input: InviteInput): Promise<{ member: Member; token: string }> {
  const member: Member = {
    id: crypto.randomBytes(6).toString("base64url"),
    name: input.name.trim().slice(0, 60) || "Friend",
    note: input.note?.trim().slice(0, 200) || undefined,
    role: "member",
    createdAt: Date.now(),
    version: 1,
    revoked: false,
    expiresAt: input.expiresInDays ? Date.now() + input.expiresInDays * 86_400_000 : null,
    limits: { minutesPerMonth: input.minutesPerMonth, prepsPerMonth: input.prepsPerMonth },
    usage: {},
    lastSeenAt: null,
  };
  await saveMember(member);
  return { member, token: await issueToken(member) };
}

export interface MemberPatch {
  name?: string;
  note?: string;
  revoked?: boolean;
  minutesPerMonth?: number | null;
  prepsPerMonth?: number | null;
  /** Invalidate the old link and issue a new one. */
  rotate?: boolean;
}

export async function updateMember(id: string, patch: MemberPatch): Promise<{ member: Member; token: string } | null> {
  if (id === OWNER_ID && (patch.revoked || patch.rotate)) return null;
  const m = await getMember(id);
  if (!m) return null;
  if (patch.name !== undefined) m.name = patch.name.trim().slice(0, 60) || m.name;
  if (patch.note !== undefined) m.note = patch.note.trim().slice(0, 200) || undefined;
  if (patch.revoked !== undefined) m.revoked = patch.revoked;
  if (patch.minutesPerMonth !== undefined) m.limits.minutesPerMonth = patch.minutesPerMonth;
  if (patch.prepsPerMonth !== undefined) m.limits.prepsPerMonth = patch.prepsPerMonth;
  if (patch.rotate) m.version += 1;
  await saveMember(m);
  return { member: m, token: await issueToken(m) };
}

export async function deleteMember(id: string): Promise<boolean> {
  if (id === OWNER_ID) return false;
  const kv = store();
  if (!(await kv.get(K.member(id)))) return false;
  await kv.del(K.member(id));
  await kv.srem(K.members, id);
  return true;
}

export async function listMembers(): Promise<{ member: Member; token: string }[]> {
  await ensureOwner();
  const ids = await store().smembers(K.members);
  const members = (await Promise.all(ids.map((id) => getMember(id)))).filter((m): m is Member => !!m);
  members.sort((a, b) => (a.id === OWNER_ID ? -1 : b.id === OWNER_ID ? 1 : b.createdAt - a.createdAt));
  return Promise.all(members.map(async (member) => ({ member, token: await issueToken(member) })));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
