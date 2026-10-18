"use client";

import type { AccessInfo } from "@/types/interview";

const PASS_KEY = "interviewiq.pass";
const KEYS_KEY = "interviewiq.keys";

export interface OwnKeys {
  anthropic: string;
  elevenlabs?: string;
  deepgram?: string;
}

/* ───────────────────────────── invite pass ───────────────────────────── */

export function getPass(): string | null {
  try {
    return localStorage.getItem(PASS_KEY);
  } catch {
    return null;
  }
}

export function setPass(pass: string) {
  localStorage.setItem(PASS_KEY, pass);
}

export function clearPass() {
  localStorage.removeItem(PASS_KEY);
}

/* ───────────────────────────── own keys ───────────────────────────── */

/** The visitor's own API keys. Stored only in this browser. */
export function getOwnKeys(): OwnKeys | null {
  try {
    const raw = localStorage.getItem(KEYS_KEY);
    const k = raw ? (JSON.parse(raw) as OwnKeys) : null;
    return k?.anthropic ? k : null;
  } catch {
    return null;
  }
}

export function setOwnKeys(keys: OwnKeys) {
  const clean = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, (v ?? "").trim()]).filter(([, v]) => v));
  localStorage.setItem(KEYS_KEY, JSON.stringify(clean));
}

export function clearOwnKeys() {
  localStorage.removeItem(KEYS_KEY);
}

/** How this browser gets in: an invite (owner pays) wins over own keys. */
export function accessMode(): "invite" | "byok" | null {
  if (getPass()) return "invite";
  if (getOwnKeys()) return "byok";
  return null;
}

/* ───────────────────────────── requests ───────────────────────────── */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { pass?: string } = {}): Promise<T> {
  const pass = init.pass ?? getPass();
  // Only send own keys when there is no invite — invite sessions never need them.
  const own = pass ? null : getOwnKeys();
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(pass ? { "x-iq-pass": pass } : {}),
      ...(own ? { "x-iq-anthropic-key": own.anthropic } : {}),
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code);
  return data as T;
}

export const fetchAccess = (pass?: string) => api<{ access: AccessInfo; ownerName: string }>("/api/access", { pass });

export const fetchConfig = () => api<{ byok: boolean; ownerName: string }>("/api/config");

export function realtimeUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/realtime`;
}

export function maskKey(k?: string): string {
  if (!k) return "—";
  return k.length <= 10 ? "••••" : `${k.slice(0, 6)}…${k.slice(-4)}`;
}
