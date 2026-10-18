# InterviewIQ

**Walk in ready.** An invite-only AI interview coach. A live interviewer talks with you out loud, listens until you've finished, adapts every follow-up to what you actually said — and then shows you, answer by answer, how to say it better.

You run it with your own API keys and share it with people who need it. They get a link — no account, no password, no keys — and everything they practice stays in their own browser.

---

## What it does

| | |
| --- | --- |
| **Live interviews** | Real-time voice (or typed) interviews with one interviewer or a panel of two. Waits for you to finish, probes vague answers, and closes naturally. |
| **Eight practice formats** | Full mock · five-minute drill · behavioral (STAR) · technical deep-dive · "tell me about yourself" · salary negotiation · fix-my-weak-spot · any custom scenario. |
| **Built for nerves** | Gentle difficulty, a 30-second breathing reset, private mid-answer hints, pause, repeat, skip, and type-instead-of-speak. |
| **Honest reports** | Overall score and grade, five skill scores, a hiring signal, what worked, three things to fix (each with a drill), and a **stronger rewrite of every answer** in the candidate's own words. Measured delivery stats: pace, filler words, answer length. Optional on-device camera metrics. |
| **Prep packs** | Paste a job post → likely questions with answer outlines, a STAR story bank built from the resume, concerns to get ahead of, questions to ask back, a day-of checklist, and optional live company research. |
| **Progress** | Readiness score, trend chart, skill averages, streaks, and a recommended next session. |
| **Languages** | English, English + Hinglish/mixed, Hindi, Spanish, French, German, Portuguese. |
| **Invite-only** | An owner console to create links, set monthly minute/prep limits, pause or rotate links, and see usage and estimated cost per person. |

### Privacy model

- **No database of anyone's answers.** Profiles, resumes, transcripts, reports and prep packs live in each person's browser (IndexedDB). They can export, restore or wipe it from their profile.
- The server keeps one small file — the invite registry (names, limits, usage counters) — in `~/.interviewiq/access.json` (or `DATA_DIR`).
- Resumes are parsed in the browser. Camera metrics (eye contact, steadiness, engagement) are computed on-device with MediaPipe; at most one still frame per minute is sent for a qualitative read, and only when the camera is on.
- Your API keys never leave the server.

---

## Quick start

**Requirements:** Node.js 20.9+ and a desktop browser with a microphone (Chrome, Edge or Safari).

```bash
npm install
cp .env.example .env.local      # then fill it in (see below)
npm run dev                     # → http://localhost:3000
```

Then:

1. Open **http://localhost:3000/admin** and enter your `ADMIN_PASSCODE`.
2. Click **Open the app** to use it yourself, or **New invite** to create a link for a friend.

### Environment

| Variable | Needed for |
| --- | --- |
| `ANTHROPIC_API_KEY` | Interviewer, reports, prep packs, hints — [console.anthropic.com](https://console.anthropic.com) |
| `ELEVENLABS_API_KEY` | The interviewer's voice — [elevenlabs.io](https://elevenlabs.io) |
| `DEEPGRAM_API_KEY` | Hearing spoken answers — [console.deepgram.com](https://console.deepgram.com) |
| `APP_SECRET` | Signs invite links. Changing it invalidates all links. If unset, one is generated in the data folder. |
| `ADMIN_PASSCODE` | Unlocks `/admin`. |
| `OWNER_NAME` | Shown to friends as "<name> invited you". |

Optional: voice IDs, model overrides, `DATA_DIR`, `TURN_SETTLE_MS`, and cost-estimate rates — see `.env.example`.

**Models** (override in `.env.local`): interviewer `claude-sonnet-5-5` (fast, conversational), reports and prep packs `claude-opus-5-5`, vision/hints/resume reading `claude-haiku-5-5`, company research `claude-sonnet-5-5` with web search. All calls opt into Anthropic's server-side refusal fallback.

---

## Sharing with a friend

An invite link only works where your server is reachable. Two easy options:

### Option A — run it on your computer and share a tunnel

```bash
npm run build && npm start
# in another terminal (free, no account needed):
cloudflared tunnel --url http://localhost:3000
```

Open the `https://….trycloudflare.com` address it prints, go to `/admin`, and create the invite **from that address** — the link will use it automatically. (Microphones need https, which the tunnel provides.) Your computer must stay on while they practice.

### Option B — deploy it

It's a single Node service (web app + realtime voice on one port), so any host that runs a long-lived Node process works — Railway, Render, Fly.io, a VPS. Not serverless platforms (Vercel functions can't hold the WebSocket).

- **Build:** `npm install && npm run build` · **Start:** `npm start` · **Health check:** `/health`
- Set the env vars above, plus `DATA_DIR` pointing at a **persistent volume** (e.g. `/data`) so invites survive redeploys.
- The server listens on `$PORT`.

### Invites from the terminal

```bash
npm run invite -- "Aarav" --minutes 120 --preps 10 --url https://your-app.example.com
```

---

## How it works

```
 Browser                                          Node server (one port)
 ───────                                          ──────────────────────
 mic → AudioWorklet → PCM ──── binary /realtime ──▶ Deepgram Nova-3 (streaming STT)
 typed answer ──────────────── candidate:text ──▶        │ waits ~3.5 s of silence
                                                         ▼
                                                  Claude Sonnet 5.5 (interviewer)
                                                         │ streamed sentence by sentence
 speakers ◀─ gapless Web Audio ◀── binary PCM ──── ElevenLabs Flash v2.5 (TTS)
 Aura orb / 3D avatar ◀── amplitude
 webcam → MediaPipe (on device) ─ cv:metrics ───▶ one frame/min → Claude Haiku 5.5
                                                         │ time up / goodbye
 /report ◀──────────────── interview:complete ─── Claude Opus 5.5 (structured report)
 IndexedDB ◀── saved locally
```

- `/realtime` is authenticated with the member's signed pass; the server enforces monthly minutes, a hard time cap per session, and records usage + estimated cost.
- If a session drops, the transcript so far is kept and can be scored later from the report page.

### Project layout

```
app/
  page.tsx              landing
  join/[token]/         invite landing
  admin/                owner console
  (app)/                signed-in app: home, practice, prep, history, profile, report, onboarding
  interview/[id]/       the live room
  api/                  access, admin, prep, report, profile/analyze
components/
  aura/AuraOrb.tsx      WebGL voice orb (the interviewer's presence)
  avatar/               optional 3D human interviewer (Three.js)
  room/ report/ shell/ ui/
hooks/                  mic, webcam, audio player, websocket
lib/
  ai/                   Claude client, interviewer prompts, report, prep, delivery stats
  server/               invite registry, pricing, http helpers
  client/               IndexedDB, API client, app store, insights
server/                 index.ts (Next + WebSocket), interviewer.ts (session engine), stt, tts, vision
scripts/invite.ts       CLI invites
```

### Scripts

```bash
npm run dev        # dev server with hot reload (http://localhost:3000)
npm run build      # production build
npm start          # production server
npm run typecheck  # TypeScript
npm run invite     # create an invite from the terminal
```

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "You need a valid invite" | Open the full invite link on that device. Links stop working if paused, rotated, deleted, expired, or if `APP_SECRET` changed. |
| Friend's link won't open | It points at `localhost`. Create invites from your tunnel or deployed URL (see *Sharing*). |
| Microphone blocked | Allow it in the address bar and reload — or choose **Type** in practice settings. Mics require https or localhost. |
| No interviewer voice | Check `ELEVENLABS_API_KEY`, unmute the tab, or turn off "Interviewer speaks out loud" for captions only. |
| It replies too soon / too slowly | Tune `TURN_SETTLE_MS` (default 3500). |
| Admin console locked | Set `ADMIN_PASSCODE` in `.env.local` and restart. |
