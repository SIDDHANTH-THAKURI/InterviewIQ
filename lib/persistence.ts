/**
 * Client-side localStorage persistence — history, drafts, cross-session data.
 * No cloud DB required; everything stays on the user's machine.
 */
import type { InterviewConfig, InterviewDocuments, InterviewFeedback } from "@/types/interview";

export interface HistoryEntry {
  id: string;
  date: number;
  config: Pick<InterviewConfig, "type" | "difficulty" | "duration" | "mode">;
  score: number;
  grade: string;
  summary: string;
}

const HISTORY_KEY = "interviewiq_history";
const DRAFT_CONFIG_KEY = "interviewiq_draft_config";
const DRAFT_DOCS_KEY = "interviewiq_draft_docs";
const MAX_HISTORY = 15;

function safeRead<T>(key: string, fallback: T): T {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota exceeded — silently skip */ }
}

export function saveToHistory(
  id: string,
  config: InterviewConfig,
  fb: InterviewFeedback,
): void {
  const existing = loadHistory();
  const filtered = existing.filter((e) => e.id !== id);
  filtered.unshift({
    id,
    date: Date.now(),
    config: { type: config.type, difficulty: config.difficulty, duration: config.duration, mode: config.mode },
    score: fb.overallScore,
    grade: fb.grade,
    summary: fb.overallSummary,
  });
  safeWrite(HISTORY_KEY, filtered.slice(0, MAX_HISTORY));
}

export function loadHistory(): HistoryEntry[] {
  return safeRead<HistoryEntry[]>(HISTORY_KEY, []);
}

export function saveDraftConfig(config: InterviewConfig): void {
  safeWrite(DRAFT_CONFIG_KEY, config);
}

export function loadDraftConfig(): Partial<InterviewConfig> | null {
  return safeRead<Partial<InterviewConfig> | null>(DRAFT_CONFIG_KEY, null);
}

export function saveDraftDocs(docs: InterviewDocuments): void {
  const total = docs.resumeText.length + docs.coverLetterText.length + docs.jobDescription.length;
  if (total > 200_000) return; // skip if suspiciously large
  safeWrite(DRAFT_DOCS_KEY, docs);
}

export function loadDraftDocs(): Partial<InterviewDocuments> | null {
  return safeRead<Partial<InterviewDocuments> | null>(DRAFT_DOCS_KEY, null);
}
