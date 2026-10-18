/**
 * Invite-only access control.
 *
 * There is no user database. The owner hands out signed invite links; each link
 * IS the member's pass (an HMAC-signed token). The server keeps a tiny registry
 * file (`.data/access.json`) with each member's name, limits, usage counters and
 * revocation state — never any interview content, which stays in the member's
 * own browser.
 *
 * All file access is synchronous on purpose: Next.js route handlers and the
 * realtime server run in the same Node process but can load separate copies of
 * this module, so the file (not memory) is the single source of truth, and
 * synchronous read-modify-write can never interleave.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
  usage: Record<string, MonthUsage>;
  lastSeenAt: number | null;
}

interface Registry {
  members: Record<string, Member>;
}

const OWNER_ID = "owner";

// Kept outside the project folder by default so dev file-watchers never see it.
export const DATA_DIR = process.env.DATA_DIR || path.join(os.homedir(), ".interviewiq");
const REGISTRY_FILE = path.join(DATA_DIR, "access.json");
const SECRET_FILE = path.join(DATA_DIR, "secret.key");

/* ───────────────────────────── secrets ───────────────────────────── */

function ensureDir() {
  if (!fs.existsSync(/*turbopackIgnore: true*/ DATA_DIR)) fs.mkdirSync(/*turbopackIgnore: true*/ DATA_DIR, { recursive: true });
}

let cachedSecret: Buffer | null = null;
function secret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.APP_SECRET?.trim();
  if (fromEnv) {
    cachedSecret = Buffer.from(fromEnv, "utf8");
    return cachedSecret;
  }
  // No APP_SECRET configured: generate one once and keep it next to the registry.
  ensureDir();
  if (!fs.existsSync(/*turbopackIgnore: true*/ SECRET_FILE)) {
    fs.writeFileSync(/*turbopackIgnore: true*/ SECRET_FILE, crypto.randomBytes(48).toString("base64url"), { mode: 0o600 });
  }
  cachedSecret = Buffer.from(fs.readFileSync(/*turbopackIgnore: true*/ SECRET_FILE, "utf8").trim(), "utf8");
  return cachedSecret;
}

/* ───────────────────────────── registry io ───────────────────────────── */

function read(): Registry {
  try {
    const raw = fs.readFileSync(/*turbopackIgnore: true*/ REGISTRY_FILE, "utf8");
    const reg = JSON.parse(raw) as Registry;
    if (reg && reg.members) return reg;
  } catch {
    /* first run or unreadable — start fresh */
  }
  return { members: {} };
}

function write(reg: Registry) {
  ensureDir();
  const tmp = REGISTRY_FILE + ".tmp";
  fs.writeFileSync(/*turbopackIgnore: true*/ tmp, JSON.stringify(reg, null, 2));
  fs.renameSync(/*turbopackIgnore: true*/ tmp, REGISTRY_FILE);
}

function mutate<T>(fn: (reg: Registry) => T): T {
  const reg = read();
  ensureOwner(reg);
  const out = fn(reg);
  write(reg);
  return out;
}

function ensureOwner(reg: Registry) {
  if (!reg.members[OWNER_ID]) {
    reg.members[OWNER_ID] = {
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
  }
}

/* ───────────────────────────── tokens ───────────────────────────── */

interface TokenPayload {
  sub: string;
  v: number;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

export function issueToken(member: Pick<Member, "id" | "version">): string {
  const body = Buffer.from(JSON.stringify({ sub: member.id, v: member.version } satisfies TokenPayload)).toString(
    "base64url"
  );
  return `${body}.${sign(body)}`;
}

function decodeToken(token: string): TokenPayload | null {
  const [body, mac] = (token || "").trim().split(".");
  if (!body || !mac) return null;
  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    return typeof p.sub === "string" && typeof p.v === "number" ? p : null;
  } catch {
    return null;
  }
}

export type VerifyResult =
  | { ok: true; member: Member }
  | { ok: false; reason: "invalid" | "revoked" | "expired" };

export function verifyPass(token: string | null | undefined): VerifyResult {
  const p = token ? decodeToken(token) : null;
  if (!p) return { ok: false, reason: "invalid" };
  const reg = read();
  ensureOwner(reg);
  const m = reg.members[p.sub];
  if (!m || m.version !== p.v) return { ok: false, reason: "invalid" };
  if (m.revoked) return { ok: false, reason: "revoked" };
  if (m.expiresAt && Date.now() > m.expiresAt) return { ok: false, reason: "expired" };
  return { ok: true, member: m };
}

/* ───────────────────────────── admin login ───────────────────────────── */

export function adminPasscodeConfigured(): boolean {
  return !!process.env.ADMIN_PASSCODE?.trim();
}

export function loginAdmin(passcode: string): string | null {
  const expected = process.env.ADMIN_PASSCODE?.trim();
  if (!expected) return null;
  const a = crypto.createHash("sha256").update(passcode.trim()).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) return null;
  const owner = mutate((reg) => reg.members[OWNER_ID]);
  return issueToken(owner);
}

/* ───────────────────────────── usage + quota ───────────────────────────── */

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function emptyUsage(): MonthUsage {
  return { minutes: 0, preps: 0, sessions: 0, costUsd: 0 };
}

export function currentUsage(m: Member): MonthUsage {
  return { ...emptyUsage(), ...(m.usage[monthKey()] ?? {}) };
}

export function recordUsage(id: string, delta: Partial<MonthUsage>) {
  mutate((reg) => {
    const m = reg.members[id];
    if (!m) return;
    const key = monthKey();
    const u = { ...emptyUsage(), ...(m.usage[key] ?? {}) };
    u.minutes = round2(u.minutes + (delta.minutes ?? 0));
    u.preps += delta.preps ?? 0;
    u.sessions += delta.sessions ?? 0;
    u.costUsd = round4(u.costUsd + (delta.costUsd ?? 0));
    m.usage[key] = u;
    m.lastSeenAt = Date.now();
  });
}

/** Records "last seen", at most every few minutes to keep writes rare. */
export function touch(id: string) {
  const m = read().members[id];
  if (m?.lastSeenAt && Date.now() - m.lastSeenAt < 5 * 60_000) return;
  mutate((reg) => {
    if (reg.members[id]) reg.members[id].lastSeenAt = Date.now();
  });
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
  const u = currentUsage(m);
  return {
    id: m.id,
    name: m.name,
    role: m.role,
    limits: m.limits,
    usage: { minutes: u.minutes, preps: u.preps, sessions: u.sessions, costUsd: u.costUsd },
  };
}

/* ───────────────────────────── invites (admin) ───────────────────────────── */

export interface InviteInput {
  name: string;
  note?: string;
  minutesPerMonth: number | null;
  prepsPerMonth: number | null;
  expiresInDays: number | null;
}

export function createInvite(input: InviteInput): { member: Member; token: string } {
  return mutate((reg) => {
    const id = crypto.randomBytes(6).toString("base64url");
    const member: Member = {
      id,
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
    reg.members[id] = member;
    return { member, token: issueToken(member) };
  });
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

export function updateMember(id: string, patch: MemberPatch): { member: Member; token: string } | null {
  if (id === OWNER_ID && (patch.revoked || patch.rotate)) return null;
  return mutate((reg) => {
    const m = reg.members[id];
    if (!m) return null;
    if (patch.name !== undefined) m.name = patch.name.trim().slice(0, 60) || m.name;
    if (patch.note !== undefined) m.note = patch.note.trim().slice(0, 200) || undefined;
    if (patch.revoked !== undefined) m.revoked = patch.revoked;
    if (patch.minutesPerMonth !== undefined) m.limits.minutesPerMonth = patch.minutesPerMonth;
    if (patch.prepsPerMonth !== undefined) m.limits.prepsPerMonth = patch.prepsPerMonth;
    if (patch.rotate) m.version += 1;
    return { member: m, token: issueToken(m) };
  });
}

export function deleteMember(id: string): boolean {
  if (id === OWNER_ID) return false;
  return mutate((reg) => {
    if (!reg.members[id]) return false;
    delete reg.members[id];
    return true;
  });
}

export function listMembers(): { member: Member; token: string }[] {
  const reg = read();
  ensureOwner(reg);
  return Object.values(reg.members)
    .sort((a, b) => (a.id === OWNER_ID ? -1 : b.id === OWNER_ID ? 1 : b.createdAt - a.createdAt))
    .map((member) => ({ member, token: issueToken(member) }));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
