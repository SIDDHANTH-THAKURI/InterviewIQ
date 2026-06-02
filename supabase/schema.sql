-- InterviewIQ — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
-- Supabase is OPTIONAL: the app runs fine without it, you just lose
-- cross-refresh session recovery and stored history.

create table if not exists public.interview_sessions (
  id          text primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  status      text,
  config      jsonb,
  transcript  jsonb,
  vision      jsonb,
  feedback    jsonb
);

create index if not exists interview_sessions_updated_at_idx
  on public.interview_sessions (updated_at desc);

-- ───────────────────────────────────────────────────────────────────────────
-- Quick start: leave Row Level Security DISABLED (the default for tables made
-- via this editor). The anon key can then read/write, which is fine for a
-- personal/demo deployment.
--
-- FOR PRODUCTION, enable RLS and add policies. The simplest workable setup is
-- to have the server write with the SERVICE ROLE key (which bypasses RLS) and
-- expose only read access to the browser:
--
-- alter table public.interview_sessions enable row level security;
--
-- create policy "anon can read feedback"
--   on public.interview_sessions for select
--   to anon using (true);
--
-- (Writes then happen only via the server using SUPABASE_SERVICE_ROLE_KEY.)
-- ───────────────────────────────────────────────────────────────────────────
