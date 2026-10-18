/**
 * Tiny key-value store for the invite registry, usage counters and live
 * session meters.
 *
 *   • Production (Vercel): Upstash Redis over its REST API — add the free
 *     "Upstash for Redis" integration and Vercel injects KV_REST_API_URL and
 *     KV_REST_API_TOKEN (UPSTASH_REDIS_REST_URL/TOKEN also work).
 *   • Local development: a JSON file in ~/.interviewiq (or DATA_DIR).
 *
 * Only owner-side bookkeeping lives here — never anyone's interview content.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type Hash = Record<string, string>;

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  hincrbyfloat(key: string, field: string, by: number): Promise<void>;
  hgetall(key: string): Promise<Hash>;
  expire(key: string, ttlSec: number): Promise<void>;
}

/* ───────────────────────────── Upstash Redis (REST) ───────────────────────────── */

class Upstash implements KV {
  constructor(
    private url: string,
    private token: string
  ) {}

  private async cmd<T = unknown>(...args: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(args.map(String)),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
    if (!res.ok || data.error) throw new Error(`Redis: ${data.error ?? res.status}`);
    return data.result as T;
  }

  get = (k: string) => this.cmd<string | null>("GET", k);
  async set(k: string, v: string, ttl?: number) {
    await (ttl ? this.cmd("SET", k, v, "EX", ttl) : this.cmd("SET", k, v));
  }
  async del(k: string) {
    await this.cmd("DEL", k);
  }
  async sadd(k: string, m: string) {
    await this.cmd("SADD", k, m);
  }
  async srem(k: string, m: string) {
    await this.cmd("SREM", k, m);
  }
  smembers = async (k: string) => (await this.cmd<string[]>("SMEMBERS", k)) ?? [];
  async hincrbyfloat(k: string, f: string, by: number) {
    await this.cmd("HINCRBYFLOAT", k, f, by);
  }
  async hgetall(k: string): Promise<Hash> {
    const flat = (await this.cmd<string[]>("HGETALL", k)) ?? [];
    const out: Hash = {};
    for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1];
    return out;
  }
  async expire(k: string, ttl: number) {
    await this.cmd("EXPIRE", k, ttl);
  }
}

/* ───────────────────────────── local JSON file ───────────────────────────── */

interface FileData {
  str: Record<string, { v: string; exp?: number }>;
  sets: Record<string, string[]>;
  hashes: Record<string, { h: Hash; exp?: number }>;
}

// Outside the project folder by default, so dev file-watchers never see it.
export const DATA_DIR = process.env.DATA_DIR || path.join(os.homedir(), ".interviewiq");
const FILE = path.join(DATA_DIR, "store.json");

class FileKV implements KV {
  private read(): FileData {
    try {
      const d = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ FILE, "utf8")) as FileData;
      return { str: d.str ?? {}, sets: d.sets ?? {}, hashes: d.hashes ?? {} };
    } catch {
      return { str: {}, sets: {}, hashes: {} };
    }
  }
  private write(d: FileData) {
    if (!fs.existsSync(/*turbopackIgnore: true*/ DATA_DIR)) fs.mkdirSync(/*turbopackIgnore: true*/ DATA_DIR, { recursive: true });
    const now = Date.now();
    for (const [k, v] of Object.entries(d.str)) if (v.exp && v.exp < now) delete d.str[k];
    for (const [k, v] of Object.entries(d.hashes)) if (v.exp && v.exp < now) delete d.hashes[k];
    const tmp = FILE + ".tmp";
    fs.writeFileSync(/*turbopackIgnore: true*/ tmp, JSON.stringify(d));
    fs.renameSync(/*turbopackIgnore: true*/ tmp, FILE);
  }
  private alive<T extends { exp?: number }>(x: T | undefined) {
    return x && (!x.exp || x.exp > Date.now()) ? x : undefined;
  }

  async get(k: string) {
    return this.alive(this.read().str[k])?.v ?? null;
  }
  async set(k: string, v: string, ttl?: number) {
    const d = this.read();
    d.str[k] = { v, exp: ttl ? Date.now() + ttl * 1000 : undefined };
    this.write(d);
  }
  async del(k: string) {
    const d = this.read();
    delete d.str[k];
    delete d.sets[k];
    delete d.hashes[k];
    this.write(d);
  }
  async sadd(k: string, m: string) {
    const d = this.read();
    d.sets[k] = [...new Set([...(d.sets[k] ?? []), m])];
    this.write(d);
  }
  async srem(k: string, m: string) {
    const d = this.read();
    d.sets[k] = (d.sets[k] ?? []).filter((x) => x !== m);
    this.write(d);
  }
  async smembers(k: string) {
    return this.read().sets[k] ?? [];
  }
  async hincrbyfloat(k: string, f: string, by: number) {
    const d = this.read();
    const cur = this.alive(d.hashes[k]) ?? { h: {} };
    cur.h[f] = String((Number(cur.h[f]) || 0) + by);
    d.hashes[k] = cur;
    this.write(d);
  }
  async hgetall(k: string) {
    return this.alive(this.read().hashes[k])?.h ?? {};
  }
  async expire(k: string, ttl: number) {
    const d = this.read();
    const exp = Date.now() + ttl * 1000;
    if (d.str[k]) d.str[k].exp = exp;
    if (d.hashes[k]) d.hashes[k].exp = exp;
    this.write(d);
  }
}

/* ───────────────────────────── pick one ───────────────────────────── */

let kv: KV | null = null;

export function store(): KV {
  if (kv) return kv;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    kv = new Upstash(url, token);
  } else if (hostedWithoutDisk()) {
    throw new Error(
      "No database connected. Create a free Upstash Redis database and set KV_REST_API_URL and KV_REST_API_TOKEN (see README → Deploying)."
    );
  } else {
    kv = new FileKV();
  }
  return kv;
}

export function storeKind(): "redis" | "file" | "missing" {
  if ((process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) && (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)) return "redis";
  return hostedWithoutDisk() ? "missing" : "file";
}

/** Hosts whose filesystem is wiped on restart/redeploy (unless DATA_DIR points at a mounted disk). */
function hostedWithoutDisk(): boolean {
  return !!(process.env.VERCEL || process.env.RENDER) && !process.env.DATA_DIR;
}
