"use client";

import type { SessionKeys } from "@/types/interview";

const STORAGE_KEY = "interviewiq_api_keys";

export function saveKeys(keys: SessionKeys): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* private-browsing / storage quota */
  }
}

export function loadKeys(): SessionKeys {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SessionKeys;
  } catch {
    return {};
  }
}

export function clearKeys(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function keysAreSet(keys: SessionKeys): boolean {
  return !!(keys.anthropic?.trim() && keys.elevenlabs?.trim() && keys.deepgram?.trim());
}
