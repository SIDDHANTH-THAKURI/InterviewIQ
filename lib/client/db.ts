"use client";

/**
 * Everything personal lives here, in the user's own browser (IndexedDB):
 * their profile, resume, sessions, reports and prep packs. Nothing is stored
 * on the server.
 */
import type {
  CandidateProfile,
  CvMetrics,
  InterviewConfig,
  InterviewContext,
  InterviewerInfo,
  InterviewFeedback,
  PrepPack,
  TranscriptTurn,
} from "@/types/interview";

export interface SessionRecord {
  id: string;
  createdAt: number;
  endedAt?: number;
  status: "ready" | "live" | "complete" | "unscored";
  config: InterviewConfig;
  context: InterviewContext;
  interviewers?: InterviewerInfo[];
  transcript: TranscriptTurn[];
  feedback?: InterviewFeedback;
  durationSec?: number;
  hintsUsed?: number;
  cv?: CvMetrics | null;
}

export interface PrepRecord {
  id: string;
  createdAt: number;
  role: string;
  company?: string;
  jobDescription?: string;
  pack: PrepPack;
  /** Questions the user has marked as practiced. */
  practiced?: number[];
}

type StoreName = "kv" | "sessions" | "preps";

const DB_NAME = "interviewiq";
const DB_VERSION = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("preps")) db.createObjectStore("preps", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ───────────────────────────── profile (kv) ───────────────────────────── */

export const getProfile = () => tx<CandidateProfile | undefined>("kv", "readonly", (s) => s.get("profile"));
export const saveProfile = (p: CandidateProfile) => tx("kv", "readwrite", (s) => s.put(p, "profile"));

/* ───────────────────────────── sessions ───────────────────────────── */

export const getSession = (id: string) => tx<SessionRecord | undefined>("sessions", "readonly", (s) => s.get(id));
export const putSession = (r: SessionRecord) => tx("sessions", "readwrite", (s) => s.put(r));
export const deleteSession = (id: string) => tx("sessions", "readwrite", (s) => s.delete(id));
export async function listSessions(): Promise<SessionRecord[]> {
  const all = await tx<SessionRecord[]>("sessions", "readonly", (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/* ───────────────────────────── prep packs ───────────────────────────── */

export const getPrep = (id: string) => tx<PrepRecord | undefined>("preps", "readonly", (s) => s.get(id));
export const putPrep = (r: PrepRecord) => tx("preps", "readwrite", (s) => s.put(r));
export const deletePrep = (id: string) => tx("preps", "readwrite", (s) => s.delete(id));
export async function listPreps(): Promise<PrepRecord[]> {
  const all = await tx<PrepRecord[]>("preps", "readonly", (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/* ───────────────────────────── backup ───────────────────────────── */

export interface Backup {
  app: "interviewiq";
  version: 1;
  exportedAt: number;
  profile?: CandidateProfile;
  sessions: SessionRecord[];
  preps: PrepRecord[];
}

export async function exportAll(): Promise<Backup> {
  const [profile, sessions, preps] = await Promise.all([getProfile(), listSessions(), listPreps()]);
  return { app: "interviewiq", version: 1, exportedAt: Date.now(), profile, sessions, preps };
}

export async function importAll(data: Backup): Promise<{ sessions: number; preps: number }> {
  if (data?.app !== "interviewiq") throw new Error("That file isn't an InterviewIQ backup.");
  if (data.profile) await saveProfile(data.profile);
  for (const s of data.sessions ?? []) await putSession(s);
  for (const p of data.preps ?? []) await putPrep(p);
  return { sessions: data.sessions?.length ?? 0, preps: data.preps?.length ?? 0 };
}

export async function wipeAll(): Promise<void> {
  const db = await open();
  await Promise.all(
    (["kv", "sessions", "preps"] as StoreName[]).map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const req = db.transaction(name, "readwrite").objectStore(name).clear();
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        })
    )
  );
}

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
