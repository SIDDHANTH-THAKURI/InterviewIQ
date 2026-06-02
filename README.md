# InterviewIQ

A real-time, AI-powered mock interview platform. An animated interviewer **speaks** to you (ElevenLabs voice), **listens** to your spoken answers (Deepgram speech-to-text), **watches** you through your webcam (Claude vision), and **adapts** every question in real time (Claude Opus 4.8) — then auto-delivers an honest, scored feedback report.

Once the interview starts, you never click anything.

---

## ✨ What's inside

| Layer | Tech |
| --- | --- |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind, Framer Motion |
| Avatar | Three.js — a hand-built stylized bust with amplitude-driven lip sync, blinking, breathing, head-tilt thinking & listening nods |
| Voice out | ElevenLabs streaming TTS (`eleven_turbo_v2`, PCM 24 kHz) → gapless Web Audio playback |
| Voice in | Deepgram `nova-2` realtime STT (16 kHz PCM via AudioWorklet) |
| Vision | Claude Haiku 4.5 on a webcam frame every 3 s |
| Brain | Claude Opus 4.8 — adaptive questions + final feedback |
| Realtime | Standalone Node WebSocket server (`ws`) |
| State | Zustand | 
| DB (optional) | Supabase (Postgres) |

---

## 🚀 Quick start

### 1. Prerequisites
- Node.js 18.18+ (you have v22 ✓)
- A desktop browser with camera + mic (Chrome/Edge/Safari)

### 2. Install
```bash
npm install
```

### 3. Add your API keys
Copy the example env file and fill it in:
```bash
cp .env.example .env.local
```

You need four keys for the live experience:

| Variable | Where to get it |
| --- | --- |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io → Profile → API Key |
| `ELEVENLABS_VOICE_ID` | ElevenLabs → Voices (default in `.env.example` is "Rachel") |
| `DEEPGRAM_API_KEY` | https://console.deepgram.com → API Keys |

Supabase keys are **optional** (see below). All keys are read **server-side only** — the browser only ever sees `NEXT_PUBLIC_WS_URL`.

### 4. Run (both servers at once)
```bash
npm run dev
```
This starts:
- the Next.js app on **http://localhost:3000**
- the realtime WebSocket server on **ws://localhost:3001**

Open http://localhost:3000 and click **Start Interview**.

> Prefer separate terminals? `npm run dev:web` and `npm run dev:ws`.

---

## ⚠️ Heads-up for this machine

Something is **already listening on port 3001** right now (a stray `node` process). The realtime server won't start until that port is free. Either:

- **Stop the other process**, or
- **Use a different port** — set both in `.env.local`:
  ```
  WS_PORT=3002
  NEXT_PUBLIC_WS_URL=ws://localhost:3002
  ```

---

## 🧠 How it works

```
 Browser (interview room)                    WebSocket server
 ─────────────────────────                   ─────────────────
 mic → AudioWorklet → PCM ───[binary]──────▶ Deepgram STT
                                              │  (interim → transcript:interim)
                                              │  (utterance end ▼)
 webcam → frame /3s ────────[vision:frame]─▶ Claude Vision ──▶ vision:analysis
                                              │
                                              ▼
                                          Claude Opus (brain)
                                          + latest vision context
                                              │ streams text
                                              ▼
 speakers ◀──[binary PCM]── gapless ◀──── ElevenLabs TTS
 avatar jaw ◀── amplitude (AnalyserNode)
                                              │
                              [INTERVIEW_COMPLETE] or timer/end
                                              ▼
 /feedback ◀──[interview:complete]──── Claude (structured JSON feedback)
```

- **Audio travels as raw binary frames**; all control events are JSON. (See `types/interview.ts` for the full protocol.)
- The brain's reply is **streamed sentence-by-sentence into TTS** so the avatar starts speaking quickly, with a soft "thinking" hum covering any gap (the avatar is never silent).
- The candidate's mic is muted into the pipeline while the avatar speaks, keeping the AI's own voice out of the transcript.

---

## 📁 Project structure

```
app/                 page.tsx (landing) · setup · interview · feedback
components/
  avatar/            AvatarCanvas · useAvatarControls · avatarLoader
  interview/         WebcamFeed · LiveTranscript · SessionTimer · AudioVisualiser
  feedback/          ScoreCircle · RadarChart · TranscriptAnnotations · VisionReport
  setup/             DocumentUpload · ConfigStep · MediaCheck
hooks/               useWebSocket · useMicrophone · useWebcam · useAudioPlayer
server/              ws.ts · interviewer.ts · tts.ts · stt.ts · vision.ts · env.ts
lib/                 claude.ts · parsePDF.ts · supabase.ts · pdfReport.ts · utils.ts
store/               interviewStore.ts (Zustand)
types/               interview.ts (shared domain + WS protocol)
public/              pcm-worklet.js (mic capture processor)
supabase/            schema.sql
```

---

## 🗄️ Supabase (optional)

Enables session recovery + stored history. To turn it on:
1. Create a project at https://supabase.com
2. Run `supabase/schema.sql` in the SQL editor
3. Add to `.env.local`:
   ```
   SUPABASE_URL=...
   SUPABASE_ANON_KEY=...
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   # optional, for production server writes that bypass RLS:
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
The server checkpoints the transcript every 30 s and saves the feedback at the end.

---

## ☁️ Deployment

- **Frontend → Vercel.** Import the repo, add all env vars. Set `NEXT_PUBLIC_WS_URL` to your deployed server URL (e.g. `wss://your-app.up.railway.app`).
- **WebSocket server → Railway** (or Render/Fly). Start command: `npm run server`. Add the same server-side keys. Railway provides `$PORT` — the server reads `WS_PORT`, so set `WS_PORT=$PORT` (or just leave Railway's default and map it). The HTTP `/health` route is provided for health checks.

---

## 🎨 Design notes & decisions

- **Accent = electric amber** (`#F59E0B`) on cream `#FAFAF8` / ink `#111`. It's a single CSS variable (`--accent` in `app/globals.css`) — change those two lines to switch to cobalt and the whole app follows.
- **Fonts:** Playfair Display (editorial display) + DM Sans (body), via `next/font`.
- **Avatar:** a self-contained Three.js bust (no external GLB download required, works offline). `components/avatar/avatarLoader.ts` has a `loadAvatar(url)` upgrade path if you want to drop in a ReadyPlayerMe GLB later. The lighting/proportions are easy to tune at the top of `AvatarCanvas.tsx` / `avatarLoader.ts`.
- **Models:** brain & feedback use `claude-opus-4-8`; vision uses `claude-haiku-4-5` for speed at a 3-second cadence. Constants live in `lib/claude.ts`.

---

## 🛠️ Troubleshooting

| Symptom | Fix |
| --- | --- |
| Interview room shows "Couldn't reach the realtime server" | The WS server isn't running, or `NEXT_PUBLIC_WS_URL`/`WS_PORT` mismatch. Run `npm run dev:ws`. |
| `EADDRINUSE :3001` | Port taken — change `WS_PORT` + `NEXT_PUBLIC_WS_URL` (see above). |
| "Missing API keys" error overlay | Fill `.env.local` and restart the WS server. |
| No avatar voice | Browser blocked audio autoplay — the room tries to resume automatically after the Begin click; if it can't, click once anywhere in the room. |
| Camera/mic blocked | Allow permissions in the browser, then hit Retry on the mic check. |
| Want to preview the UI without keys | Landing, setup and **/feedback** (shows a sample report) all work without any keys. |

---

## 📜 Scripts

```bash
npm run dev        # app + ws server together
npm run dev:web    # Next.js only
npm run dev:ws     # WebSocket server only (watch mode)
npm run build      # production build
npm run start      # serve the production build
npm run server     # run the WS server (production)
npm run typecheck  # type-check app + server
```

---

Built like it's shipping tomorrow.
