"use client";

import { DIMENSIONS, type Dimension, type DimensionScores } from "@/types/interview";
import type { SessionRecord } from "./db";

export function scored(sessions: SessionRecord[]): SessionRecord[] {
  return sessions.filter((s) => s.status === "complete" && s.feedback && s.feedback.overallScore > 0);
}

/** Average of each dimension across the most recent scored sessions. */
export function dimensionAverages(sessions: SessionRecord[], last = 5): DimensionScores | null {
  const s = scored(sessions).slice(0, last);
  if (!s.length) return null;
  const out = Object.fromEntries(DIMENSIONS.map((d) => [d, 0])) as DimensionScores;
  for (const x of s) for (const d of DIMENSIONS) out[d] += x.feedback!.dimensions[d] ?? 0;
  for (const d of DIMENSIONS) out[d] = Math.round(out[d] / s.length);
  return out;
}

export function weakestDimension(sessions: SessionRecord[]): Dimension | null {
  const avg = dimensionAverages(sessions);
  if (!avg) return null;
  return DIMENSIONS.reduce((a, b) => (avg[b] < avg[a] ? b : a));
}

/** Readiness: recent scores, weighted toward the latest. */
export function readiness(sessions: SessionRecord[]): number | null {
  const s = scored(sessions).slice(0, 4);
  if (!s.length) return null;
  const weights = [0.4, 0.27, 0.2, 0.13].slice(0, s.length);
  const total = weights.reduce((a, b) => a + b, 0);
  return Math.round(s.reduce((sum, x, i) => sum + x.feedback!.overallScore * weights[i], 0) / total);
}

/** Consecutive days (ending today or yesterday) with at least one session. */
export function streak(sessions: SessionRecord[]): number {
  const days = new Set(
    sessions.filter((s) => s.status === "complete" || s.status === "unscored").map((s) => dayKey(s.createdAt))
  );
  let n = 0;
  const d = new Date();
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d.getTime()))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export const WEAKSPOT_FOCUS: Record<Dimension, string> = {
  communication: "Clear, concise answers that address exactly what was asked.",
  structure: "Structured answers — headline first, then Situation, Task, Action, Result.",
  relevance: "Connecting every answer back to the role and what the employer needs.",
  depth: "Specifics: numbers, trade-offs, and what you personally did.",
  confidence: "Owning your achievements and speaking with conviction, without hedging.",
};
