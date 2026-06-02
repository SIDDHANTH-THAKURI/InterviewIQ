/**
 * Supabase persistence (optional).
 *
 * Everything here degrades gracefully: if the Supabase env vars are absent,
 * the getters return null and every helper becomes a quiet no-op. The app runs
 * fine without a database — you just lose cross-refresh session recovery.
 *
 * Uses a relative type import so the standalone WS server can import it too.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  InterviewConfig,
  InterviewFeedback,
  TranscriptTurn,
  VisionAnalysis,
} from "../types/interview";

export const SESSIONS_TABLE = "interview_sessions";

let _server: SupabaseClient | null | undefined;
let _browser: SupabaseClient | null | undefined;

/** Server-side client (WS server / API routes). Prefers the service role key. */
export function getSupabaseServer(): SupabaseClient | null {
  if (_server !== undefined) return _server;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  _server =
    url && key
      ? createClient(url, key, { auth: { persistSession: false } })
      : null;
  return _server;
}

/** Browser client (anon key only). */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (_browser !== undefined) return _browser;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  _browser = url && key ? createClient(url, key) : null;
  return _browser;
}

export interface SessionSnapshot {
  sessionId: string;
  config?: InterviewConfig;
  transcript?: TranscriptTurn[];
  vision?: VisionAnalysis[];
  status?: "live" | "complete";
  feedback?: InterviewFeedback | null;
}

/** Upsert the live session state (called on a timer + at completion). */
export async function saveSessionSnapshot(
  snapshot: SessionSnapshot
): Promise<void> {
  const db = getSupabaseServer();
  if (!db) return;
  try {
    const row: Record<string, unknown> = {
      id: snapshot.sessionId,
      updated_at: new Date().toISOString(),
    };
    if (snapshot.config) row.config = snapshot.config;
    if (snapshot.transcript) row.transcript = snapshot.transcript;
    if (snapshot.vision) row.vision = snapshot.vision;
    if (snapshot.status) row.status = snapshot.status;
    if (snapshot.feedback !== undefined) row.feedback = snapshot.feedback;
    await db.from(SESSIONS_TABLE).upsert(row, { onConflict: "id" });
  } catch (err) {
    console.warn("[supabase] saveSessionSnapshot failed:", (err as Error).message);
  }
}

/** Load just the feedback for a session (used by the feedback page on refresh). */
export async function loadFeedback(
  sessionId: string
): Promise<InterviewFeedback | null> {
  const db = getSupabaseBrowser() ?? getSupabaseServer();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from(SESSIONS_TABLE)
      .select("feedback")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw error;
    return (data?.feedback as InterviewFeedback | undefined) ?? null;
  } catch (err) {
    console.warn("[supabase] loadFeedback failed:", (err as Error).message);
    return null;
  }
}
