"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, PhoneOff, Wifi, Monitor, AlertTriangle } from "lucide-react";
import { useInterviewStore } from "@/store/interviewStore";
import { loadKeys } from "@/lib/keys";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useMicrophone } from "@/hooks/useMicrophone";
import { useWebcam } from "@/hooks/useWebcam";
import { WebcamFeed } from "@/components/interview/WebcamFeed";
import { LiveTranscript, type TranscriptEntry } from "@/components/interview/LiveTranscript";
import { SessionTimer } from "@/components/interview/SessionTimer";
import type { AvatarState } from "@/components/avatar/useAvatarControls";
import { VISION_INTERVAL_MS, CV_METRICS_INTERVAL_MS, type ServerMessage } from "@/types/interview";

const AvatarCanvas = dynamic(
  () => import("@/components/avatar/AvatarCanvas").then((m) => m.AvatarCanvas),
  { ssr: false, loading: () => <div className="h-full w-full" /> }
);

type RoomStatus = "connecting" | "live" | "wrapping" | "error";
type Blocked = null | "mobile" | "unsupported";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3002";
// Set NEXT_PUBLIC_USE_GLB=true to try /public/avatar-{male,female}.glb. The GLB
// is only used if it actually contains facial blendshapes (visemes); otherwise
// the polished built-in avatar is used.
const GLB_URL = process.env.NEXT_PUBLIC_USE_GLB === "true";

export default function InterviewPage() {
  const router = useRouter();
  const sessionId = useInterviewStore((s) => s.sessionId);
  const documents = useInterviewStore((s) => s.documents);
  const config = useInterviewStore((s) => s.config);
  const setFeedback = useInterviewStore((s) => s.setFeedback);

  const player = useAudioPlayer();
  const webcam = useWebcam();

  const [blocked, setBlocked] = useState<Blocked>(null);
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [variant, setVariant] = useState<"male" | "female">("female");
  const [interviewerName, setInterviewerName] = useState("Your interviewer");
  const [activePanelSpeaker, setActivePanelSpeaker] = useState<{ name: string; gender: "male" | "female" } | null>(null);
  const [panelSecondary, setPanelSecondary] = useState<{ name: string; gender: "male" | "female" } | null>(null);
  // primaryGender is fixed on mount from the status message — never changes mid-session
  const [primaryGender, setPrimaryGender] = useState<"male" | "female">("female");
  const [interviewerLine, setInterviewerLine] = useState("");
  const [candidateFinal, setCandidateFinal] = useState("");
  const [candidateInterim, setCandidateInterim] = useState("");
  const [thinking, setThinking] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [panelLog, setPanelLog] = useState<TranscriptEntry[]>([]);

  const endedRef = useRef(false);
  const speakingRef = useRef(false);
  const startSentRef = useRef(false);
  const isPanelRef = useRef(false);
  const visionTimer = useRef<number | null>(null);
  const cvTimer = useRef<number | null>(null);
  const trackerRef = useRef<import("@/lib/visionTracker").VisionTracker | null>(null);
  const cleanupRef = useRef<() => void>(() => {});

  /* ── Server → client messages ── */
  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case "status":
          if (msg.state === "live") setStatus("live");
          if (msg.message) setInterviewerName(msg.message);
          if (msg.gender) { setVariant(msg.gender); setPrimaryGender(msg.gender); }
          if (msg.panelSecondary) { setPanelSecondary(msg.panelSecondary as { name: string; gender: "male" | "female" }); isPanelRef.current = true; }
          break;
        case "panel:speaker":
          setActivePanelSpeaker({ name: msg.name, gender: msg.gender });
          break;
        case "panel:segment":
          setPanelLog((prev) => [...prev, { speaker: msg.name, text: msg.text, isYou: false }]);
          break;
        case "ai:thinking":
          setStatus((s) => (s === "connecting" ? "live" : s));
          setThinking(true);
          setAvatarState("thinking");
          player.startCue();
          break;
        case "avatar:speaking:start":
          setStatus((s) => (s === "connecting" ? "live" : s));
          setThinking(false);
          speakingRef.current = true;
          player.stopCue();
          setAvatarState("speaking");
          break;
        case "avatar:speaking:end":
          // Server TTS data is done — but audio is still buffered in the
          // browser. Poll until it actually finishes, THEN switch state and
          // notify the server to arm the silence / settle timer.
          {
            const pollDone = () => {
              if (player.isSpeaking()) {
                setTimeout(pollDone, 100);
              } else {
                speakingRef.current = false;
                player.stopCue();
                setAvatarState("listening");
                ws.sendJSON({ type: "playback:complete" });
              }
            };
            setTimeout(pollDone, 100);
          }
          break;
        case "interview:question":
          if (!isPanelRef.current) {
            setInterviewerLine(msg.text);
            setCandidateFinal("");
            setCandidateInterim("");
          }
          break;
        case "transcript:interim":
          setCandidateInterim(msg.text);
          break;
        case "transcript:final":
          setCandidateInterim("");
          if (isPanelRef.current) {
            setPanelLog((prev) => {
              const last = prev[prev.length - 1];
              if (last?.isYou) {
                return prev.map((e, i) =>
                  i === prev.length - 1 ? { ...e, text: e.text + " " + msg.text } : e
                );
              }
              return [...prev, { speaker: "You", text: msg.text, isYou: true }];
            });
          } else {
            setCandidateFinal((prev) => (prev ? prev + " " : "") + msg.text);
          }
          break;
        case "interview:complete":
          endedRef.current = true;
          setFeedback(msg.feedback);
          cleanupRef.current();
          router.push("/feedback");
          break;
        case "error":
          setErrorMsg(msg.message);
          if (msg.fatal) setStatus("error");
          break;
        default:
          break;
      }
    },
    [player, router, setFeedback]
  );

  const ws = useWebSocket({
    url: WS_URL,
    onMessage: handleMessage,
    onBinary: (buf) => player.enqueue(buf),
    onClose: () => {
      if (!endedRef.current) {
        setStatus("error");
        setErrorMsg(
          "The realtime connection closed. Make sure the WebSocket server is running (npm run dev:ws)."
        );
      }
    },
    onError: () => {
      if (!endedRef.current) {
        setStatus("error");
        setErrorMsg(
          "Couldn’t reach the realtime server at " + WS_URL + ". Is it running?"
        );
      }
    },
  });

  const mic = useMicrophone({
    onPcm: useCallback(
      (chunk: ArrayBuffer) => {
        // Only stream the mic when the interviewer's voice is NOT actually
        // playing (checked against real audio playback, not the server's
        // "done generating" signal). This stops the AI from hearing itself.
        if (!player.isSpeaking()) ws.sendBinary(chunk);
      },
      [ws, player]
    ),
  });

  /* ── Stable cleanup ── */
  const cleanup = useCallback(() => {
    if (visionTimer.current) {
      clearInterval(visionTimer.current);
      visionTimer.current = null;
    }
    if (cvTimer.current) {
      clearInterval(cvTimer.current);
      cvTimer.current = null;
    }
    trackerRef.current?.stop();
    trackerRef.current = null;
    mic.stop();
    webcam.stop();
    player.stopCue();
    player.reset();
    ws.disconnect();
  }, [mic, webcam, player, ws]);
  useEffect(() => {
    cleanupRef.current = cleanup;
  }, [cleanup]);

  /* ── Mount: guard environment, then start media + connect ── */
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setBlocked("unsupported");
      return;
    }
    if (window.matchMedia("(max-width: 767px)").matches) {
      setBlocked("mobile");
      return;
    }
    if (!sessionId) {
      router.replace("/setup");
      return;
    }
    let cancelled = false;
    player.unlock();
    // Start media BEFORE connecting so we know the mic's true sample rate to
    // send to STT (clean, un-resampled audio = better transcription).
    (async () => {
      await webcam.start();
      await mic.start();
      if (cancelled) return;
      ws.connect();
      // Spin up the in-browser CV tracker (best-effort; non-blocking).
      try {
        const { VisionTracker } = await import("@/lib/visionTracker");
        const tracker = new VisionTracker();
        const ok = await tracker.init();
        if (ok && !cancelled && webcam.videoRef.current) {
          trackerRef.current = tracker;
          tracker.start(webcam.videoRef.current);
        }
      } catch {
        /* CV is optional — interview works without it */
      }
    })();
    return () => {
      cancelled = true;
      cleanupRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── When the socket opens, kick off the interview ── */
  useEffect(() => {
    if (blocked || !sessionId) return;
    if (ws.status === "open" && !startSentRef.current) {
      startSentRef.current = true;
      ws.sendJSON({
        type: "interview:start",
        sessionId,
        resumeText: documents.resumeText,
        coverLetterText: documents.coverLetterText,
        jobDescription: documents.jobDescription,
        config,
        audioSampleRate: mic.sampleRateRef.current,
        apiKeys: loadKeys(),
      });
      setTimerRunning(true);
      if (!visionTimer.current) {
        visionTimer.current = window.setInterval(() => {
          const frame = webcam.captureFrame();
          if (frame) ws.sendJSON({ type: "vision:frame", data: frame });
        }, VISION_INTERVAL_MS);
      }
      // Push aggregated in-browser CV metrics to the server periodically.
      if (!cvTimer.current) {
        cvTimer.current = window.setInterval(() => {
          const t = trackerRef.current;
          if (t) ws.sendJSON({ type: "cv:metrics", metrics: t.getMetrics() });
        }, CV_METRICS_INTERVAL_MS);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.status, blocked, sessionId]);

  const flushMetrics = useCallback(() => {
    const t = trackerRef.current;
    if (t) ws.sendJSON({ type: "cv:metrics", metrics: t.getMetrics() });
  }, [ws]);

  const endEarly = useCallback(() => {
    if (endedRef.current) return;
    setStatus("wrapping");
    flushMetrics();
    ws.sendJSON({ type: "interview:end" });
  }, [ws, flushMetrics]);

  const onTimerElapsed = useCallback(() => {
    if (endedRef.current || status === "wrapping") return;
    setStatus("wrapping");
    flushMetrics();
    ws.sendJSON({ type: "interview:end" });
  }, [ws, status, flushMetrics]);

  const statusLabel = useMemo(() => {
    if (status === "connecting") return "Connecting…";
    if (status === "wrapping") return "Wrapping up…";
    if (status === "error") return "Disconnected";
    if (thinking || avatarState === "thinking") return "Thinking…";
    if (avatarState === "speaking") return "Speaking";
    return "Listening…";
  }, [status, thinking, avatarState]);

  if (blocked) return <BlockedScreen reason={blocked} />;

  const primaryName = panelSecondary
    ? (interviewerName.split(" & ")[0] || interviewerName)
    : interviewerName;

  const avatarBg = "radial-gradient(circle at 50% 36%, #2c2c33 0%, #1c1c1e 55%, #141416 100%)";

  const overlays = (
    <>
      <AnimatePresence>
        {status === "connecting" && (
          <motion.div
            initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-charcoal-deep/60 backdrop-blur-sm"
          >
            <Loader2 className="h-7 w-7 animate-spin text-accent" />
            <p className="text-sm text-cream/70">
              {panelSecondary ? "Your interviewers are getting ready…" : "Your interviewer is getting ready…"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {status === "error" && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-charcoal-deep/85 px-6 text-center backdrop-blur"
          >
            <AlertTriangle className="h-8 w-8 text-accent" />
            <p className="max-w-sm text-sm text-cream/80">{errorMsg}</p>
            <div className="flex gap-3">
              <button onClick={() => location.reload()} className="rounded-full bg-cream px-5 py-2.5 text-sm font-medium text-ink">Retry</button>
              <Link href="/" className="rounded-full border border-cream/25 px-5 py-2.5 text-sm text-cream/80 hover:bg-cream/10">Exit</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  const footer = (
    <footer className="group flex items-center justify-between border-t border-white/10 px-6 py-3">
      <SessionTimer durationMinutes={config.duration} running={timerRunning} onElapsed={onTimerElapsed} />
      <div className="flex items-center gap-2 text-xs text-cream/40">
        <Wifi className="h-3.5 w-3.5" />
        {status === "live" ? "Live" : status === "wrapping" ? "Finishing" : status}
      </div>
      <button
        onClick={endEarly}
        disabled={status === "wrapping" || status === "error"}
        className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs text-cream/50 transition-all duration-200 hover:border-red-400/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <PhoneOff className="h-3.5 w-3.5" /> End interview early
      </button>
    </footer>
  );

  /* ── PANEL MODE layout ───────────────────────────────────────────────── */
  if (panelSecondary) {
    return (
      <main className="relative h-[100dvh] w-full overflow-hidden bg-charcoal-deep text-cream">
        <div className="flex h-full flex-col">
          {/* Top ~62%: two avatars side by side */}
          <section className="relative min-h-0 flex-[3]" style={{ background: avatarBg }}>
            <div className="flex h-full">
              <PanelSlot
                name={primaryName}
                gender={primaryGender}
                avatarState={getPanelAvatarState(primaryName, activePanelSpeaker, avatarState, thinking)}
                isSpeaking={activePanelSpeaker?.name === primaryName}
                getAmplitude={activePanelSpeaker?.name === primaryName ? player.getAmplitude : ZERO}
                getMouthShape={activePanelSpeaker?.name === primaryName ? player.getMouthShape : ZERO_MOUTH}
                glbUrl={GLB_URL ? `/avatar-${primaryGender}.glb` : undefined}
                isGLB={GLB_URL}
              />
              <div className="w-px shrink-0 bg-white/10" />
              <PanelSlot
                name={panelSecondary.name}
                gender={panelSecondary.gender}
                avatarState={getPanelAvatarState(panelSecondary.name, activePanelSpeaker, avatarState, thinking)}
                isSpeaking={activePanelSpeaker?.name === panelSecondary.name}
                getAmplitude={activePanelSpeaker?.name === panelSecondary.name ? player.getAmplitude : ZERO}
                getMouthShape={activePanelSpeaker?.name === panelSecondary.name ? player.getMouthShape : ZERO_MOUTH}
                glbUrl={GLB_URL ? `/avatar-${panelSecondary.gender}.glb` : undefined}
                isGLB={GLB_URL}
              />
            </div>
            {/* Status chip centered at bottom of avatar area */}
            <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
              <StatusChip label={statusLabel} state={avatarState} status={status} />
            </div>
            {overlays}
          </section>

          {/* Bottom ~38%: transcript full-width + webcam PiP */}
          <div className="relative min-h-0 flex-[2] overflow-hidden border-t border-white/10 bg-[#111113]">
            {/* Transcript scrollable, padded right so PiP doesn't cover text */}
            <div className="h-full overflow-y-auto px-6 py-4" style={{ paddingRight: "13rem" }}>
              <LiveTranscript
                className="min-h-0"
                entries={panelLog}
                candidateInterim={candidateInterim}
                thinking={thinking}
              />
            </div>
            {/* PiP webcam — floating bottom-right like a real video call */}
            <div className="absolute bottom-4 right-4 z-10 w-44 overflow-hidden rounded-xl border border-white/15 shadow-2xl ring-1 ring-black/40">
              <WebcamFeed videoRef={webcam.videoRef} active={webcam.isActive} />
            </div>
          </div>

          {footer}
        </div>
      </main>
    );
  }

  /* ── STANDARD MODE layout ────────────────────────────────────────────── */
  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-charcoal-deep text-cream">
      <div className="flex h-full flex-col">
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[3fr_2fr]">
          <section className="relative min-h-0" style={{ background: avatarBg }}>
            <AvatarCanvas
              state={avatarState}
              variant={variant}
              glbUrl={GLB_URL ? `/avatar-${variant}.glb` : undefined}
              isGLB={GLB_URL}
              getAmplitude={player.getAmplitude}
              getMouthShape={player.getMouthShape}
              className="absolute inset-0 h-full w-full"
            />
            <div className="pointer-events-none absolute left-6 top-6">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-cream/40">Interviewer</p>
              <p className="display text-2xl font-semibold text-cream/90">{interviewerName}</p>
            </div>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
              <StatusChip label={statusLabel} state={avatarState} status={status} />
            </div>
            {overlays}
          </section>

          <aside className="flex min-h-0 flex-col gap-5 border-t border-white/10 p-5 md:border-l md:border-t-0 md:p-6">
            <WebcamFeed videoRef={webcam.videoRef} active={webcam.isActive} />
            <LiveTranscript
              className="min-h-0 flex-1"
              interviewerName={interviewerName}
              interviewerLine={interviewerLine}
              candidateFinal={candidateFinal}
              candidateInterim={candidateInterim}
              thinking={thinking}
            />
          </aside>
        </div>
        {footer}
      </div>
    </main>
  );
}

/* ─────────────────────────── Panel helpers ─────────────────────────────── */

const ZERO = () => 0;
const ZERO_MOUTH = () => ({ open: 0, wide: 0 });

function getPanelAvatarState(
  name: string,
  activeSpeaker: { name: string } | null,
  globalState: AvatarState,
  thinking: boolean,
): AvatarState {
  if (activeSpeaker?.name === name) return globalState;
  if (thinking) return "thinking";
  if (globalState === "listening") return "listening";
  return "idle";
}

function PanelSlot({
  name,
  gender,
  avatarState,
  isSpeaking,
  getAmplitude,
  getMouthShape,
  glbUrl,
  isGLB,
}: {
  name: string;
  gender: "male" | "female";
  avatarState: AvatarState;
  isSpeaking: boolean;
  getAmplitude: () => number;
  getMouthShape: () => { open: number; wide: number };
  glbUrl?: string;
  isGLB: boolean;
}) {
  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Subtle glow behind the speaking avatar */}
      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            key="glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
            style={{
              background:
                "radial-gradient(ellipse at 50% 100%, rgba(201,180,138,0.13) 0%, transparent 70%)",
            }}
          />
        )}
      </AnimatePresence>

      <AvatarCanvas
        state={avatarState}
        variant={gender}
        glbUrl={glbUrl}
        isGLB={isGLB}
        getAmplitude={getAmplitude}
        getMouthShape={getMouthShape}
        className="absolute inset-0 h-full w-full"
      />

      {/* Name tag */}
      <div className="pointer-events-none absolute left-4 top-5 z-10">
        <p
          className="text-[10px] font-medium uppercase tracking-[0.22em] transition-colors duration-300"
          style={{ color: isSpeaking ? "rgba(201,180,138,0.75)" : "rgba(255,255,255,0.28)" }}
        >
          {isSpeaking ? "Speaking" : "Listening"}
        </p>
        <p
          className="display mt-0.5 text-xl font-semibold transition-colors duration-300"
          style={{ color: isSpeaking ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)" }}
        >
          {name}
        </p>
      </div>

      {/* Speaking indicator bar at bottom */}
      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            key="bar"
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ scaleX: 0, opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-x-0 bottom-0 h-[2px] origin-left"
            style={{ background: "var(--accent, #c9b48a)" }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────────── Helpers ────────────────────────────────── */

function StatusChip({
  label,
  state,
  status,
}: {
  label: string;
  state: AvatarState;
  status: RoomStatus;
}) {
  const dot =
    status === "error"
      ? "bg-red-400"
      : state === "speaking"
        ? "bg-accent"
        : state === "thinking" || status === "connecting"
          ? "bg-amber-300"
          : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm text-cream/80 backdrop-blur">
      <span className={`relative flex h-2 w-2`}>
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dot} opacity-60`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      {label}
    </div>
  );
}

function BlockedScreen({ reason }: { reason: Exclude<Blocked, null> }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-charcoal-deep px-6 text-center text-cream">
      <Monitor className="h-10 w-10 text-accent" />
      <h1 className="display mt-6 text-3xl font-semibold">
        {reason === "mobile" ? "Best experienced on desktop" : "Browser not supported"}
      </h1>
      <p className="mt-3 max-w-sm text-cream/60">
        {reason === "mobile"
          ? "InterviewIQ needs a camera and microphone on a larger screen. Open this on a desktop or laptop to begin."
          : "This browser can’t access the camera and microphone APIs required. Try a recent version of Chrome, Edge or Safari on desktop."}
      </p>
      <Link
        href="/"
        className="mt-8 rounded-full bg-cream px-6 py-3 text-sm font-medium text-ink"
      >
        Back to home
      </Link>
    </main>
  );
}
