"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Keyboard,
  Lightbulb,
  Mic,
  MicOff,
  Pause,
  PhoneOff,
  Play,
  Repeat2,
  SendHorizontal,
  SkipForward,
  X,
} from "lucide-react";
import { AuraOrb, type AuraMood } from "@/components/aura/AuraOrb";
import { Lobby } from "@/components/room/Lobby";
import { Button, FullScreenLoader, Modal } from "@/components/ui/kit";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useMicrophone } from "@/hooks/useMicrophone";
import { useWebcam } from "@/hooks/useWebcam";
import { useWebSocket } from "@/hooks/useWebSocket";
import { unlockPlayback } from "@/lib/audioBus";
import { getOwnKeys, getPass, realtimeUrl } from "@/lib/client/api";
import { getSession, putSession, type SessionRecord } from "@/lib/client/db";
import { useApp } from "@/lib/client/store";
import { cn, formatClock } from "@/lib/cn";
import {
  CV_METRICS_INTERVAL_MS,
  VISION_INTERVAL_MS,
  type InterviewerInfo,
  type ServerMessage,
  type TranscriptTurn,
} from "@/types/interview";

const AvatarCanvas = dynamic(() => import("@/components/avatar/AvatarCanvas").then((m) => m.AvatarCanvas), {
  ssr: false,
  loading: () => <div className="h-full w-full" />,
});

type Phase = "loading" | "lobby" | "connecting" | "live" | "paused" | "wrapping" | "error" | "missing";

interface Caption {
  role: "interviewer" | "candidate";
  speaker?: string;
  text: string;
}

const WRAP_STEPS = [
  "Reading back the transcript…",
  "Scoring each answer against the role…",
  "Writing stronger versions of your answers…",
  "Picking your next best practice…",
];

export default function InterviewRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile, bootstrap, refreshAccess, status: appStatus } = useApp();

  const [record, setRecord] = useState<SessionRecord | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [interviewers, setInterviewers] = useState<InterviewerInfo[]>([]);
  const [mood, setMood] = useState<AuraMood>("idle");
  const [activeSpeaker, setActiveSpeaker] = useState<string>("");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [streaming, setStreaming] = useState("");
  const [interim, setInterim] = useState("");
  const [pending, setPending] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [wrapNotice, setWrapNotice] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [draft, setDraft] = useState("");
  const [micMuted, setMicMuted] = useState(false);
  const [wrapStep, setWrapStep] = useState(0);

  const player = useAudioPlayer();
  const webcam = useWebcam();
  const micLevel = useRef(0);
  const pausedRef = useRef(false);
  const mutedRef = useRef(false);
  const endedRef = useRef(false);
  const startedRef = useRef(false);
  const transcriptRef = useRef<TranscriptTurn[]>([]);
  const hintsRef = useRef(0);
  const trackerRef = useRef<import("@/lib/visionTracker").VisionTracker | null>(null);
  const timers = useRef<number[]>([]);
  const captionsEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => void bootstrap(), [bootstrap]);

  /* ── load the prepared session ── */
  useEffect(() => {
    void getSession(id).then((r) => {
      if (!r) return setPhase("missing");
      if (r.status === "complete" || r.status === "unscored") return router.replace(`/report/${id}`);
      setRecord(r);
      setPhase("lobby");
    });
  }, [id, router]);

  const save = useCallback(
    (patch: Partial<SessionRecord>) => {
      setRecord((cur) => {
        if (!cur) return cur;
        const next = { ...cur, ...patch };
        void putSession(next);
        return next;
      });
    },
    []
  );

  /* ── server → client ── */
  const onMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case "session:ready":
          setInterviewers(msg.interviewers);
          save({ interviewers: msg.interviewers, status: "live" });
          break;
        case "status":
          if (msg.state === "live") setPhase((p) => (p === "wrapping" ? p : "live"));
          if (msg.state === "paused") setPhase("paused");
          if (msg.state === "closing") setPhase("wrapping");
          break;
        case "ai:thinking":
          setMood("thinking");
          if (record?.config.voiceOut) player.startCue();
          break;
        case "avatar:speaking:start":
          player.stopCue();
          setMood("speaking");
          if (msg.speaker) setActiveSpeaker(msg.speaker);
          break;
        case "avatar:speaking:end": {
          // Audio is still buffered in the browser — wait for it to finish playing.
          const poll = () => {
            if (player.isSpeaking()) return void setTimeout(poll, 100);
            setMood((m) => (m === "speaking" ? "listening" : m));
            ws.sendJSON({ type: "playback:complete" });
          };
          setTimeout(poll, 100);
          break;
        }
        case "interviewer:delta":
          player.stopCue();
          setMood("speaking");
          setStreaming((s) => s + msg.text);
          break;
        case "interviewer:line":
          player.stopCue();
          setStreaming("");
          setActiveSpeaker(msg.speaker);
          setCaptions((c) => [...c, { role: "interviewer", speaker: msg.speaker, text: msg.text }]);
          transcriptRef.current.push({ role: "interviewer", text: msg.text, ts: Date.now(), speaker: msg.speaker });
          if (!record?.config.voiceOut) setMood("listening");
          setHint(null);
          break;
        case "transcript:interim":
          setInterim(msg.text);
          break;
        case "transcript:final":
          setInterim("");
          setPending((p) => (p ? p + " " : "") + msg.text);
          break;
        case "candidate:committed":
          setPending("");
          setInterim("");
          setCaptions((c) => [...c, { role: "candidate", text: msg.text }]);
          transcriptRef.current.push({ role: "candidate", text: msg.text, ts: Date.now() });
          save({ transcript: [...transcriptRef.current] });
          break;
        case "coach:hint":
          setHintLoading(false);
          setHint(msg.text);
          break;
        case "interview:wrapping":
          setWrapNotice(true);
          setTimeout(() => setWrapNotice(false), 6000);
          break;
        case "interview:complete": {
          endedRef.current = true;
          const unscored = msg.feedback.overallScore === 0 && msg.feedback.answers.length === 0;
          setRecord((cur) => {
            if (!cur) return cur;
            const next: SessionRecord = {
              ...cur,
              status: unscored ? "unscored" : "complete",
              endedAt: Date.now(),
              durationSec: Math.round(elapsedRef.current),
              transcript: msg.transcript,
              feedback: msg.feedback,
              hintsUsed: hintsRef.current,
              cv: msg.feedback.liveMetrics ?? null,
            };
            void putSession(next).then(() => {
              teardown();
              void refreshAccess();
              router.replace(`/report/${id}`);
            });
            return next;
          });
          break;
        }
        case "error":
          if (msg.fatal) {
            setError({ message: msg.message, code: msg.code });
            setPhase("error");
          } else {
            setError({ message: msg.message });
            setTimeout(() => setError(null), 5000);
          }
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [player, save, record?.config.voiceOut]
  );

  const ws = useWebSocket({
    url: typeof window === "undefined" ? "" : realtimeUrl(),
    onMessage,
    onBinary: (buf) => player.enqueue(buf),
    onClose: () => {
      if (!endedRef.current && startedRef.current) {
        setError({ message: "The connection dropped. Your transcript so far is saved." });
        setPhase("error");
      }
    },
  });

  const mic = useMicrophone({
    onPcm: useCallback(
      (chunk: ArrayBuffer) => {
        // Never stream while the interviewer is audible, paused, or muted.
        if (pausedRef.current || mutedRef.current || player.isSpeaking()) return;
        ws.sendBinary(chunk);
      },
      [ws, player]
    ),
    onLevel: useCallback((l: number) => {
      micLevel.current = l;
    }, []),
  });

  const elapsedRef = useRef(0);
  useEffect(() => {
    if (phase !== "live") return;
    const t = window.setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    captionsEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [captions, interim, pending, streaming]);

  const teardown = useCallback(() => {
    timers.current.forEach((t) => clearInterval(t));
    timers.current = [];
    trackerRef.current?.stop();
    trackerRef.current = null;
    mic.stop();
    webcam.stop();
    player.stopCue();
    player.reset();
    ws.disconnect();
  }, [mic, webcam, player, ws]);

  useEffect(() => () => teardown(), []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── join: the user gesture that starts everything ── */
  const join = useCallback(async () => {
    if (!record) return;
    setPhase("connecting");
    await unlockPlayback();
    await player.unlock();
    if (record.config.camera) await webcam.start();
    if (record.config.inputMode === "voice") await mic.start();
    ws.connect();
  }, [record, player, webcam, mic, ws]);

  useEffect(() => {
    if (ws.status !== "open" || startedRef.current || !record) return;
    startedRef.current = true;
    const pass = getPass();
    ws.sendJSON({
      type: "interview:start",
      ...(pass ? { pass } : { keys: getOwnKeys() ?? undefined }),
      sessionId: record.id,
      config: record.config,
      context: record.context,
      candidateName: profile?.name,
      audioSampleRate: mic.sampleRateRef.current,
    });
    if (record.config.camera) {
      timers.current.push(
        window.setInterval(() => {
          if (pausedRef.current) return;
          const frame = webcam.captureFrame();
          if (frame) ws.sendJSON({ type: "vision:frame", data: frame });
        }, VISION_INTERVAL_MS)
      );
      timers.current.push(
        window.setInterval(() => {
          const t = trackerRef.current;
          if (t) ws.sendJSON({ type: "cv:metrics", metrics: t.getMetrics() });
        }, CV_METRICS_INTERVAL_MS)
      );
      void (async () => {
        try {
          const { VisionTracker } = await import("@/lib/visionTracker");
          const tracker = new VisionTracker();
          if ((await tracker.init()) && webcam.videoRef.current) {
            trackerRef.current = tracker;
            tracker.start(webcam.videoRef.current);
          }
        } catch {
          /* optional */
        }
      })();
    }
  }, [ws.status, record, ws, webcam, mic.sampleRateRef, profile?.name]);

  /* ── controls ── */
  const togglePause = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    ws.sendJSON({ type: next ? "control:pause" : "control:resume" });
    if (next) {
      player.reset();
      setPhase("paused");
    } else setPhase("live");
  };
  const askHint = () => {
    if (hintLoading) return;
    hintsRef.current += 1;
    setHintLoading(true);
    setHint(null);
    ws.sendJSON({ type: "control:hint" });
  };
  const endNow = () => {
    setConfirmEnd(false);
    const t = trackerRef.current;
    if (t) ws.sendJSON({ type: "cv:metrics", metrics: t.getMetrics() });
    ws.sendJSON({ type: "interview:end" });
    setPhase("wrapping");
  };
  const sendText = () => {
    const text = draft.trim();
    if (!text) return;
    ws.sendJSON({ type: "candidate:text", text });
    setDraft("");
    setMood("thinking");
  };

  // The stage (and its <video>) mounts after Join, so attach the camera stream once both exist.
  useEffect(() => {
    const v = webcam.videoRef.current;
    const stream = webcam.stream.current;
    if (v && stream && v.srcObject !== stream) {
      v.srcObject = stream;
      void v.play().catch(() => {});
    }
  });

  useEffect(() => {
    if (phase !== "wrapping") return;
    const t = setInterval(() => setWrapStep((s) => Math.min(WRAP_STEPS.length - 1, s + 1)), 4500);
    return () => clearInterval(t);
  }, [phase]);

  // Keyboard: H hint · R repeat · P pause (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (phase !== "live" && phase !== "paused") return;
      if (e.key === "h" && record?.config.coach) askHint();
      if (e.key === "r") ws.sendJSON({ type: "control:repeat" });
      if (e.key === "p") togglePause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (phase === "missing")
    return (
      <div className="grid min-h-dvh place-items-center text-center">
        <div>
          <p className="text-lg font-medium">This session doesn't exist on this device.</p>
          <Button href="/practice" className="mt-6">
            Start a new one
          </Button>
        </div>
      </div>
    );
  if (phase === "loading" || !record || appStatus === "loading" || appStatus === "idle") return <FullScreenLoader />;
  if (phase === "lobby")
    return (
      <Lobby config={record.config} context={record.context} name={profile?.name ?? ""} onJoin={join} onExit={() => router.push("/practice")} />
    );

  const { config } = record;
  const lead = interviewers[0];
  const planned = config.duration * 60;
  const getLevel = () =>
    mood === "speaking" ? player.getAmplitude() : mood === "listening" ? micLevel.current * 0.55 : 0.05;

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-ink-950">
      {/* ambient */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-colors duration-[1500ms]",
          mood === "speaking"
            ? "bg-[radial-gradient(ellipse_at_35%_45%,rgba(255,138,76,0.13),transparent_60%)]"
            : mood === "listening"
              ? "bg-[radial-gradient(ellipse_at_35%_45%,rgba(125,211,252,0.10),transparent_60%)]"
              : "bg-[radial-gradient(ellipse_at_35%_45%,rgba(167,139,250,0.10),transparent_60%)]"
        )}
      />

      {/* top bar */}
      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60", phase === "live" ? "animate-ping bg-bad" : "bg-warn")} />
            <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", phase === "live" ? "bg-bad" : "bg-warn")} />
          </span>
          <span className="font-mono text-sm tabular-nums text-paper-dim">
            {formatClock(elapsed)} <span className="text-faint">/ {formatClock(planned)}</span>
          </span>
          <span className="hidden text-sm text-faint sm:inline">· {record.context.role}</span>
        </div>
        <div className="h-1 w-32 overflow-hidden rounded-full bg-white/10 sm:w-56">
          <div className="h-full rounded-full bg-gradient-to-r from-tide via-iris to-ember transition-all duration-1000" style={{ width: `${Math.min(100, (elapsed / planned) * 100)}%` }} />
        </div>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 grid-rows-[1fr_auto] gap-4 px-4 pb-4 sm:px-8 lg:grid-cols-[1.4fr_1fr] lg:grid-rows-1">
        {/* stage */}
        <section className="relative min-h-[300px] overflow-hidden rounded-xl3 border hairline bg-ink-900/60">
          <div className={cn("absolute inset-0 flex", interviewers.length > 1 ? "divide-x divide-white/5" : "")}>
            {(interviewers.length ? interviewers : [null]).map((iv, idx) => {
              const isActive = !iv || interviewers.length === 1 || activeSpeaker === iv.name;
              const slotMood: AuraMood = isActive ? mood : mood === "thinking" ? "thinking" : "idle";
              return (
                <div key={iv?.name ?? idx} className="relative flex-1">
                  {config.avatar === "human" && iv ? (
                    <AvatarCanvas
                      state={slotMood}
                      variant={iv.gender}
                      getAmplitude={isActive ? player.getAmplitude : ZERO}
                      getMouthShape={isActive ? player.getMouthShape : ZERO_MOUTH}
                      personality={config.persona === "warm" ? "friendly" : config.persona}
                      className="absolute inset-0 h-full w-full"
                    />
                  ) : (
                    <AuraOrb
                      mood={slotMood}
                      getLevel={isActive ? getLevel : LOW}
                      energy={slotMood === "thinking" ? 0.8 : 0.35}
                      scale={interviewers.length > 1 ? 0.8 : 1.05}
                      className={cn("absolute inset-0 h-full w-full transition-opacity duration-700", !isActive && "opacity-55")}
                    />
                  )}
                  {iv && (
                    <div className="absolute left-5 top-5">
                      <p className={cn("text-[11px] font-medium uppercase tracking-[0.18em] transition-colors", isActive && mood === "speaking" ? "text-ember-soft" : "text-faint")}>
                        {isActive && mood === "speaking" ? "Speaking" : iv.title}
                      </p>
                      <p className="mt-0.5 text-lg font-semibold tracking-tight">{iv.name}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* state chip */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
            <StateChip phase={phase} mood={mood} />
          </div>

          {/* camera PiP */}
          {config.camera && (
            <div className="absolute bottom-5 right-5 w-36 overflow-hidden rounded-2xl border border-white/15 shadow-2xl sm:w-48">
              <video ref={webcam.videoRef} muted playsInline className="aspect-video w-full -scale-x-100 bg-ink-800 object-cover" />
            </div>
          )}

          {/* hint card */}
          <AnimatePresence>
            {(hint || hintLoading) && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute right-5 top-5 w-[min(22rem,calc(100%-2.5rem))] rounded-2xl border border-gold/30 bg-ink-850/95 p-4 shadow-2xl backdrop-blur"
              >
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-gold">
                    <Lightbulb className="h-3.5 w-3.5" /> Coach · only you see this
                  </p>
                  <button onClick={() => setHint(null)} aria-label="Dismiss hint" className="text-mute hover:text-paper">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {hintLoading && !hint ? (
                  <p className="shimmer-text mt-2 text-sm">Thinking of a nudge…</p>
                ) : (
                  <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-paper">{hint}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {wrapNotice && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute left-1/2 top-5 -translate-x-1/2 rounded-full border border-warn/30 bg-ink-850/90 px-4 py-2 text-xs text-warn">
                Almost time — your interviewer will wrap up.
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* captions */}
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl3 border hairline bg-ink-900/60 max-lg:max-h-[38dvh]">
          <div className="flex items-center justify-between border-b hairline px-5 py-3.5">
            <p className="text-sm font-medium">Live transcript</p>
            <p className="text-xs text-faint">{config.inputMode === "voice" ? "Speak naturally" : "Type your answer"}</p>
          </div>
          <div className="mask-fade-y min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {captions.length === 0 && !streaming && (
              <p className="pt-6 text-center text-sm text-faint">Your conversation will appear here.</p>
            )}
            {captions.map((c, i) => (
              <CaptionRow key={i} c={c} />
            ))}
            {streaming && <CaptionRow c={{ role: "interviewer", speaker: lead?.name, text: streaming }} live />}
            {(pending || interim) && (
              <CaptionRow c={{ role: "candidate", text: `${pending}${pending && interim ? " " : ""}${interim}` }} live />
            )}
            <div ref={captionsEnd} />
          </div>
          {config.inputMode === "text" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendText();
              }}
              className="border-t hairline p-3"
            >
              <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 focus-within:border-ember/40">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendText();
                    }
                  }}
                  rows={2}
                  placeholder="Type your answer… (Enter to send)"
                  className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-1.5 text-[14.5px] outline-none placeholder:text-faint"
                  disabled={phase !== "live"}
                />
                <Button type="submit" size="sm" variant="glow" disabled={!draft.trim() || phase !== "live"} aria-label="Send answer">
                  <SendHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </form>
          )}
        </aside>
      </div>

      {/* control dock */}
      <footer className="relative z-10 flex justify-center px-4 pb-5">
        <div className="glass flex items-center gap-1.5 rounded-full bg-ink-850/80 p-1.5">
          {config.inputMode === "voice" ? (
            <DockButton
              label={micMuted ? "Unmute" : "Mute"}
              onClick={() => {
                mutedRef.current = !mutedRef.current;
                setMicMuted(mutedRef.current);
              }}
              active={micMuted}
              danger={micMuted}
            >
              {micMuted ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
            </DockButton>
          ) : (
            <DockButton label="Typing" disabled>
              <Keyboard className="h-[18px] w-[18px]" />
            </DockButton>
          )}
          <DockButton label={phase === "paused" ? "Resume" : "Pause"} kbd="P" onClick={togglePause} active={phase === "paused"} disabled={phase !== "live" && phase !== "paused"}>
            {phase === "paused" ? <Play className="h-[18px] w-[18px]" /> : <Pause className="h-[18px] w-[18px]" />}
          </DockButton>
          <DockButton label="Repeat" kbd="R" onClick={() => ws.sendJSON({ type: "control:repeat" })} disabled={phase !== "live"}>
            <Repeat2 className="h-[18px] w-[18px]" />
          </DockButton>
          {config.coach && (
            <DockButton label="Hint" kbd="H" onClick={askHint} disabled={phase !== "live"} glow>
              <Lightbulb className="h-[18px] w-[18px]" />
            </DockButton>
          )}
          <DockButton label="Skip" onClick={() => ws.sendJSON({ type: "control:skip" })} disabled={phase !== "live"}>
            <SkipForward className="h-[18px] w-[18px]" />
          </DockButton>
          <span className="mx-1 h-7 w-px bg-white/10" />
          <button
            onClick={() => setConfirmEnd(true)}
            disabled={phase === "wrapping" || phase === "connecting"}
            className="flex h-11 items-center gap-2 rounded-full bg-bad/90 px-5 text-sm font-medium text-white transition hover:bg-bad disabled:opacity-40"
          >
            <PhoneOff className="h-4 w-4" /> <span className="hidden sm:inline">End</span>
          </button>
        </div>
      </footer>

      {/* overlays */}
      <AnimatePresence>
        {phase === "connecting" && (
          <Overlay>
            <div className="h-48 w-48">
              <AuraOrb mood="thinking" energy={0.7} className="h-full w-full" />
            </div>
            <p className="shimmer-text mt-2 text-sm">Your interviewer is joining…</p>
          </Overlay>
        )}
        {phase === "paused" && (
          <Overlay>
            <p className="display text-5xl">Paused</p>
            <p className="mt-3 text-sm text-mute">Take a breath. The clock is stopped.</p>
            <Button variant="glow" size="lg" className="mt-8" onClick={togglePause}>
              <Play className="h-4 w-4" /> I'm ready
            </Button>
          </Overlay>
        )}
        {phase === "wrapping" && (
          <Overlay>
            <div className="h-56 w-56">
              <AuraOrb mood="thinking" energy={0.9} className="h-full w-full" />
            </div>
            <p className="display mt-2 text-4xl">That's a wrap.</p>
            <AnimatePresence mode="wait">
              <motion.p key={wrapStep} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-3 text-sm text-mute">
                {WRAP_STEPS[wrapStep]}
              </motion.p>
            </AnimatePresence>
          </Overlay>
        )}
        {phase === "error" && (
          <Overlay>
            <AlertTriangle className="h-9 w-9 text-warn" />
            <p className="mt-4 max-w-sm text-center text-[15px] text-paper-dim">{error?.message}</p>
            <div className="mt-8 flex gap-3">
              {error?.code === "keys" ? (
                <Button
                  variant="glow"
                  onClick={() => {
                    teardown();
                    router.push("/keys");
                  }}
                >
                  Manage my keys
                </Button>
              ) : transcriptRef.current.some((t) => t.role === "candidate") && error?.code !== "auth" ? (
                <Button
                  variant="glow"
                  onClick={() => {
                    save({ status: "unscored", transcript: [...transcriptRef.current], endedAt: Date.now(), durationSec: elapsedRef.current, hintsUsed: hintsRef.current });
                    teardown();
                    router.replace(`/report/${id}`);
                  }}
                >
                  Score what I have
                </Button>
              ) : (
                <Button variant="glow" onClick={() => location.reload()}>
                  Try again
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  teardown();
                  router.push("/home");
                }}
              >
                Leave
              </Button>
            </div>
          </Overlay>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && phase !== "error" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full border border-warn/30 bg-ink-800 px-4 py-2 text-sm text-warn">
            {error.message}
          </motion.div>
        )}
      </AnimatePresence>

      <Modal open={confirmEnd} onClose={() => setConfirmEnd(false)} title="End the interview?">
        <p className="-mt-1 text-sm text-mute">
          {captions.some((c) => c.role === "candidate")
            ? "You'll get your report for everything so far."
            : "You haven't answered anything yet, so there won't be much to score."}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
            Keep going
          </Button>
          <Button variant="danger" onClick={endNow}>
            End & get report
          </Button>
        </div>
      </Modal>
    </main>
  );
}

const ZERO = () => 0;
const LOW = () => 0.03;
const ZERO_MOUTH = () => ({ open: 0, wide: 0 });

function StateChip({ phase, mood }: { phase: Phase; mood: AuraMood }) {
  const label =
    phase === "connecting" ? "Joining…" : phase === "paused" ? "Paused" : mood === "speaking" ? "Speaking" : mood === "thinking" ? "Thinking" : "Listening";
  const dot = mood === "speaking" ? "bg-ember" : mood === "thinking" ? "bg-iris" : "bg-tide";
  return (
    <motion.div layout className="glass flex items-center gap-2.5 rounded-full bg-ink-900/70 px-4 py-2 text-sm">
      <span className="relative flex h-2 w-2">
        <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", dot)} />
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", dot)} />
      </span>
      <AnimatePresence mode="wait">
        <motion.span key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-paper-dim">
          {label}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}

function CaptionRow({ c, live }: { c: Caption; live?: boolean }) {
  const ai = c.role === "interviewer";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className={cn("flex flex-col", ai ? "items-start" : "items-end")}>
      <p className={cn("mb-1 text-[11px] font-medium uppercase tracking-[0.14em]", ai ? "text-ember-soft/80" : "text-tide/80")}>
        {ai ? c.speaker || "Interviewer" : "You"}
      </p>
      <p
        className={cn(
          "max-w-[92%] rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed",
          ai ? "rounded-tl-md bg-white/[0.05] text-paper" : "rounded-tr-md bg-tide/10 text-paper",
          live && "opacity-75"
        )}
      >
        {c.text}
        {live && <span className="ml-1 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-current" />}
      </p>
    </motion.div>
  );
}

function DockButton({
  label,
  kbd,
  onClick,
  children,
  active,
  disabled,
  danger,
  glow,
}: {
  label: string;
  kbd?: string;
  onClick?: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  glow?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={kbd ? `${label} (${kbd})` : label}
      aria-label={label}
      className={cn(
        "group relative flex h-11 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition disabled:opacity-35",
        active ? (danger ? "bg-bad/20 text-bad" : "bg-paper text-ink-900") : glow ? "text-gold hover:bg-gold/10" : "text-paper-dim hover:bg-white/[0.07] hover:text-paper"
      )}
    >
      {children}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-ink-950/80 px-6 backdrop-blur-xl"
    >
      {children}
    </motion.div>
  );
}
