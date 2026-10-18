# InterviewIQ

**Walk in ready.** An AI interview coach. A live interviewer talks with you out loud, listens until you've finished, adapts every follow-up to what you actually said — and then shows you, answer by answer, how to say it better.

There are two ways in:

- **Invite link (free for them, on your keys).** You run it with your API keys and send a private link to someone who needs it. No account, no password — and they never see or touch your keys. You set their monthly limits.
- **Bring your own keys.** Anyone else can paste their own Anthropic key (plus optional ElevenLabs and Deepgram keys) and practice on their own account. Your keys are never used for them. Turn this off with `ALLOW_BYOK=false`.

Either way, everything they practice stays in their own browser.

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
| **Invites + own keys** | An owner console to create links, set monthly minute/prep limits, pause or rotate links, and see usage and estimated cost per person — plus a "use my own keys" page with live key testing for everyone else. |

### Privacy model

- **No database of anyone's answers.** Profiles, resumes, transcripts, reports and prep packs live in each person's browser (IndexedDB). They can export, restore or wipe it from their profile.
- The server keeps only owner-side bookkeeping — the invite list (names, limits, usage counters) — in Upstash Redis when hosted, or a file in `~/.interviewiq` locally.
- Resumes are parsed in the browser. Camera metrics (eye contact, steadiness, engagement) are computed on-device with MediaPipe; at most one still frame per minute is sent for a qualitative read, and only when the camera is on.
- **Your keys never leave the server, and are only used for valid invite links.** The server reads them in one place (`lib/server/keys.ts`, `ownerKeys()`), only after an invite is verified. Every AI call must be handed a key explicitly — there is no default to fall back on — so a request without a valid invite can only ever run on the visitor's own keys.
- **Visitors' own keys** are stored only in their browser, sent over the encrypted connection per request/session, used in memory, and never written to disk or logged. A rejected or missing key simply fails; it is never topped up with yours.

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
| `ALLOW_BYOK` | `true` (default) lets anyone use the app with their own keys. `false` makes it invite-only. |

Optional: voice IDs, model overrides, `DATA_DIR`, `TURN_SETTLE_MS`, and cost-estimate rates — see `.env.example`.

**Models** (override in `.env.local`): interviewer `claude-sonnet-5-5` (fast, conversational), reports and prep packs `claude-opus-5-5`, vision/hints/resume reading `claude-haiku-5-5`, company research `claude-sonnet-5-5` with web search. All calls opt into Anthropic's server-side refusal fallback.

---

## Deploying (Render, free)

The app is one Node service — web app plus the live voice connection on the same port — so it needs a host that keeps a process running and allows WebSockets. **Render** works on its free plan. (Vercel doesn't: it can't hold the live voice connection.)

**1. Create the free database** (stores the invite list and usage — nothing else)

1. Sign up at [upstash.com](https://upstash.com) → **Create Database** → Redis, any region close to your Render region, free plan.
2. On the database page, open the **REST API** section and copy the **`UPSTASH_REDIS_REST_URL`** and **`UPSTASH_REDIS_REST_TOKEN`**.

**2. Configure the Render web service** (Settings)

| Setting | Value |
| --- | --- |
| Branch | `master` |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/health` |

**3. Environment variables** (Environment tab)

| Key | Value |
| --- | --- |
| `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `DEEPGRAM_API_KEY` | your keys |
| `ELEVENLABS_VOICE_ID_MALE`, `ELEVENLABS_VOICE_ID_FEMALE` | optional voice IDs |
| `APP_SECRET` | a long random string (keep it stable — changing it invalidates links) |
| `ADMIN_PASSCODE` | your admin passcode |
| `OWNER_NAME` | your name |
| `ALLOW_BYOK` | `true` or `false` |
| `KV_REST_API_URL` | the Upstash REST URL |
| `KV_REST_API_TOKEN` | the Upstash REST token |
| `NODE_VERSION` | `22` |

Save, then **Manual Deploy → Deploy latest commit**. Open `https://<your-service>.onrender.com/admin`, log in, and create invites there — links use that address automatically.

> Free Render services sleep after ~15 minutes idle; the first visit afterwards takes up to a minute to wake. A paid instance removes that.

### Other ways to share

- **From your own computer:** `npm run build && npm start`, then `cloudflared tunnel --url http://localhost:3000`, and create invites from the `https://…trycloudflare.com` address. Works while your PC is on.
- **Any other Node host** (Railway, Fly.io, a VPS): same build/start commands and env vars. Instead of Redis you can mount a persistent disk and set `DATA_DIR` to it.

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
| "You need a valid invite" | Open the full invite link on that device — or use **Use my own keys**. Links stop working if paused, rotated, deleted, expired, or if `APP_SECRET` changed. |
| "Your Anthropic key was rejected" | The visitor's own key is wrong or revoked — fix it at `/keys`. |
| Own-keys user can't speak / hear | Speaking needs a Deepgram key and the interviewer's voice needs an ElevenLabs key; without them the app falls back to typing and captions. |
| Friend's link won't open | It points at `localhost`. Create invites from your deployed or tunnel URL (see *Deploying*). |
| "No database connected" | Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` from Upstash, then redeploy. |
| First load takes ~1 minute | Free Render is waking up from sleep. |
| Microphone blocked | Allow it in the address bar and reload — or choose **Type** in practice settings. Mics require https or localhost. |
| No interviewer voice | Check `ELEVENLABS_API_KEY`, unmute the tab, or turn off "Interviewer speaks out loud" for captions only. |
| It replies too soon / too slowly | Tune `TURN_SETTLE_MS` (default 3500). |
| Admin console locked | Set `ADMIN_PASSCODE` in `.env.local` and restart. |
