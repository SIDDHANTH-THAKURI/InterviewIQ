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
| Voice in | Deepgram `nova-3` realtime STT (16 kHz PCM via AudioWorklet) |
| Vision | Claude Haiku 4.5 on a webcam frame every 3 s |
| Brain | Claude Opus 4.8 — adaptive questions + final feedback |
| Realtime | Standalone Node WebSocket server (`ws`) |
| State | Zustand + localStorage persistence |
| DB (optional) | Supabase (Postgres) |

---

## 🚀 Quick start

### 1. Prerequisites
- Node.js 18.18+ (v22 recommended)
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

| Variable | Purpose | Where to get it |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Interviewer brain + feedback | https://console.anthropic.com → API Keys |
| `ELEVENLABS_API_KEY` | Interviewer voice (TTS) | https://elevenlabs.io → Profile → API Key |
| `DEEPGRAM_API_KEY` | Candidate speech recognition (STT) | https://console.deepgram.com → API Keys |
| `ELEVENLABS_VOICE_ID_MALE` | Male interviewer voice | ElevenLabs → Voices (default: "Adam") |
| `ELEVENLABS_VOICE_ID_FEMALE` | Female interviewer voice | ElevenLabs → Voices (default: "Rachel") |

Supabase keys are **optional** (see below). All keys are read **server-side only** — the browser only ever sees `NEXT_PUBLIC_WS_URL`.

> **BYOK mode:** Users can also enter their own API keys directly in the app at `/keys` — no `.env.local` required for end-users.

### 4. Run (both servers at once)
```bash
npm run dev
```
This starts:
- the Next.js app on **http://localhost:3000**
- the realtime WebSocket server on **ws://localhost:3002**

Open http://localhost:3000 and follow the flow: landing → API keys → intro → interview setup → interview.

> Prefer separate terminals? `npm run dev:web` and `npm run dev:ws`.

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
- The brain's reply is **streamed sentence-by-sentence into TTS** so the avatar starts speaking quickly, with a soft "thinking" hum covering any gap.
- The candidate's mic is muted while the avatar speaks, keeping the AI's own voice out of the transcript.
- **Panel mode** spawns two AI interviewers with distinct voices and names; the LLM emits `[Name]: text` tags that the server routes to the correct TTS instance.

---

## 🗺️ User flow

```
/ (landing) → /keys (API keys, mandatory) → /welcome (animated intro) → /setup → /interview → /feedback
```

- `/keys` — BYOK keys entry. Keys are stored in `localStorage`, never sent to any server other than the respective API.
- `/welcome` — one-time cinematic intro with the 3D avatar speaking via ElevenLabs. Auto-skipped on return visits.
- `/setup` — upload CV/JD, choose role, interview type, persona, duration, and optional panel mode.
- `/interview` — live interview room (webcam, mic, avatar, transcript).
- `/feedback` — scored report with dimension breakdown, vision notes, and transcript annotations. Saved to `localStorage` history.

---

## 📁 Project structure

```
app/
  page.tsx             landing (motion graphics, ambient blobs, live orb)
  keys/                API key entry (BYOK)
  welcome/             one-time animated intro with 3D avatar + ElevenLabs TTS
  setup/               interview configuration
  interview/           live interview room
  feedback/            scored feedback report
  api/intro-tts/       server-side ElevenLabs proxy (avoids CORS on /welcome)
components/
  avatar/              AvatarCanvas · useAvatarControls · avatarLoader
  interview/           WebcamFeed · LiveTranscript · SessionTimer · AudioVisualiser
  feedback/            ScoreCircle · RadarChart · TranscriptAnnotations · VisionReport
  setup/               DocumentUpload · ConfigStep · MediaCheck
  ui/                  LoadingLink (spinner nav) · Reveal
hooks/
  useWebSocket         WS connection + message routing
  useMicrophone        AudioWorklet mic capture
  useWebcam            webcam feed
  useAudioPlayer       ElevenLabs PCM playback + lip-sync amplitude
  useIntroSpeech       ElevenLabs TTS for /welcome intro sequence
server/                ws.ts · interviewer.ts · tts.ts · stt.ts · vision.ts · env.ts
lib/
  claude.ts            prompt builders, voice pickers, panel helpers
  persistence.ts       localStorage history + draft config helpers
  parsePDF.ts
  supabase.ts
  pdfReport.ts
store/                 interviewStore.ts (Zustand + sessionStorage)
types/                 interview.ts (shared domain + WS protocol)
public/                pcm-worklet.js (mic capture processor)
supabase/              schema.sql
```

---

## 🎤 Interview modes

| Mode | Description |
| --- | --- |
| **Standard** | Single AI interviewer, chosen persona (Friendly / Tough / Brutal) |
| **Panel** | Two AI interviewers with distinct names and voices conduct the session together |

Panel mode is toggled in `/setup` under the Format group.

---

## 🗄️ Supabase (optional)

Enables session recovery + cloud history. To turn it on:
1. Create a project at https://supabase.com
2. Run `supabase/schema.sql` in the SQL editor
3. Add to `.env.local`:
   ```
   SUPABASE_URL=...
   SUPABASE_ANON_KEY=...
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   # optional, for server writes that bypass RLS:
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
The server checkpoints the transcript every 30 s and saves feedback at the end. Without Supabase, history is stored in `localStorage` (up to 15 sessions).

---

## ☁️ Deployment

- **Frontend → Vercel.** Import the repo, add all env vars. Set `NEXT_PUBLIC_WS_URL` to your deployed server URL (e.g. `wss://your-app.up.railway.app`).
- **WebSocket server → Railway** (or Render/Fly). Start command: `npm run server`. Add the same server-side keys. Railway provides `$PORT` — set `WS_PORT=$PORT` (or map it in Railway's settings). The HTTP `/health` route is provided for health checks.

---

## 🎨 Design notes

- **Accent = electric amber** (`#F59E0B`) on cream `#FAFAF8` / ink `#111`. Single CSS variable (`--accent` in `app/globals.css`) — change two lines to switch the whole app.
- **Fonts:** Playfair Display (editorial display) + DM Sans (body), via `next/font`.
- **Avatar:** self-contained Three.js bust — no external GLB download, works offline. `components/avatar/avatarLoader.ts` has a `loadAvatar(url)` upgrade path for ReadyPlayerMe GLBs (requires blendshapes/visemes for lip sync).
- **Models:** brain & feedback → `claude-opus-4-8`; vision → `claude-haiku-4-5` (3-second cadence). Constants in `lib/claude.ts`.

---

## 🛠️ Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Couldn't reach the realtime server" | WS server isn't running, or `NEXT_PUBLIC_WS_URL`/`WS_PORT` mismatch. Run `npm run dev:ws`. |
| `EADDRINUSE :3002` | Port taken — change `WS_PORT` and `NEXT_PUBLIC_WS_URL` in `.env.local`. |
| "Missing API keys" error overlay | Fill all three keys at `/keys` (Anthropic, ElevenLabs, Deepgram) or in `.env.local`, then restart the WS server. |
| No avatar voice on `/welcome` | Audio was blocked before the user gesture. Go back to `/keys` and hit Save again — that click unlocks the audio context. |
| No avatar voice in interview | Browser blocked autoplay — click once anywhere in the room to unlock. |
| Camera/mic blocked | Allow permissions in the browser, then hit Retry on the mic check. |
| Preview without keys | Landing, setup, and `/feedback` (sample report) all work without any keys. |

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
