"use client";

import type { AccessInfo } from "@/types/interview";

const PASS_KEY = "interviewiq.pass";

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
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(pass ? { "x-iq-pass": pass } : {}),
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code);
  return data as T;
}

export const fetchAccess = (pass?: string) => api<{ access: AccessInfo; ownerName: string }>("/api/access", { pass });

export function realtimeUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/realtime`;
}
