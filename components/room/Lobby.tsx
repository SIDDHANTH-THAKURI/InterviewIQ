"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Camera, CameraOff, Headphones, Lightbulb, Mic, MicOff, Volume2, Wind } from "lucide-react";
import { Badge, Button, Eyebrow } from "@/components/ui/kit";
import { cn } from "@/lib/cn";
import { DIFFICULTY_LABELS, FORMAT_META, type InterviewConfig, type InterviewContext } from "@/types/interview";

/**
 * The waiting room: check camera + mic, optionally breathe, then join. The
 * "Join" click is the user gesture that unlocks audio playback.
 */
export function Lobby({
  config,
  context,
  name,
  onJoin,
  onExit,
}: {
  config: InterviewConfig;
  context: InterviewContext;
  name: string;
  onJoin: () => void;
  onExit: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cam, setCam] = useState<"pending" | "ok" | "denied" | "off">(config.camera ? "pending" : "off");
  const [mic, setMic] = useState<"pending" | "ok" | "denied" | "off">(config.inputMode === "voice" ? "pending" : "off");
  const [level, setLevel] = useState(0);
  const [breathing, setBreathing] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let ctx: AudioContext | null = null;
    let cancelled = false;
    (async () => {
      const wantVideo = config.camera;
      const wantAudio = config.inputMode === "voice";
      if (!wantVideo && !wantAudio) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: wantVideo, audio: wantAudio });
        if (cancelled) return;
        if (wantVideo) {
          setCam("ok");
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            void videoRef.current.play().catch(() => {});
          }
        }
        if (wantAudio) {
          setMic("ok");
          ctx = new AudioContext();
          const src = ctx.createMediaStreamSource(stream);
          const an = ctx.createAnalyser();
          an.fftSize = 512;
          src.connect(an);
          const buf = new Uint8Array(an.fftSize);
          const loop = () => {
            raf = requestAnimationFrame(loop);
            an.getByteTimeDomainData(buf);
            let s = 0;
            for (let i = 0; i < buf.length; i++) s += ((buf[i] - 128) / 128) ** 2;
            setLevel(Math.min(1, Math.sqrt(s / buf.length) * 5));
          };
          loop();
        }
      } catch {
        if (wantVideo) setCam("denied");
        if (wantAudio) setMic("denied");
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
    };
  }, [config.camera, config.inputMode]);

  const blocked = mic === "denied";

  return (
    <main className="relative min-h-dvh overflow-hidden px-5 py-8 sm:px-10">
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-30" />
      <div className="relative mx-auto flex max-w-6xl items-center justify-between">
        <button onClick={onExit} className="text-sm text-mute hover:text-paper">
          ← Leave
        </button>
        <Badge tone="ember">{FORMAT_META[config.format].label}</Badge>
      </div>

      <div className="relative mx-auto mt-8 grid max-w-6xl items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
        {/* Preview */}
        <div className="glass relative aspect-video overflow-hidden rounded-xl3 bg-ink-850">
          {config.camera ? (
            <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-mute">
              <div className="text-center">
                <CameraOff className="mx-auto h-8 w-8" />
                <p className="mt-3 text-sm">Camera is off for this session</p>
              </div>
            </div>
          )}
          {cam === "denied" && (
            <div className="absolute inset-0 grid place-items-center bg-ink-900/80 p-6 text-center text-sm text-paper-dim">
              Camera blocked. Allow it in your browser's address bar, or continue without it.
            </div>
          )}
          <div className="absolute bottom-4 left-4 flex items-center gap-2">
            <span className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
              {config.inputMode === "voice" ? (
                mic === "ok" ? (
                  <>
                    <Mic className="h-3.5 w-3.5 text-good" />
                    <span className="flex h-3 items-end gap-[2px]">
                      {[0.2, 0.45, 0.7, 0.95, 0.6].map((t, i) => (
                        <span
                          key={i}
                          className={cn("w-[3px] rounded-full transition-all duration-75", level > t * 0.6 ? "bg-good" : "bg-white/20")}
                          style={{ height: `${4 + t * 8}px` }}
                        />
                      ))}
                    </span>
                    {level > 0.08 ? "We can hear you" : "Say something to test"}
                  </>
                ) : mic === "denied" ? (
                  <>
                    <MicOff className="h-3.5 w-3.5 text-bad" /> Microphone blocked
                  </>
                ) : (
                  "Checking mic…"
                )
              ) : (
                <>Typing your answers</>
              )}
            </span>
          </div>
          <AnimatePresence>
            {breathing && <Breathe onDone={() => setBreathing(false)} />}
          </AnimatePresence>
        </div>

        {/* Ready */}
        <div>
          <Eyebrow>Waiting room</Eyebrow>
          <h1 className="display mt-3 text-[clamp(2.4rem,4.5vw,3.5rem)]">
            Ready when you are, <span className="italic text-ember-grad">{name || "friend"}</span>.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-mute">
            {context.role}
            {context.company ? ` at ${context.company}` : ""} · {config.duration} minutes · {DIFFICULTY_LABELS[config.difficulty].toLowerCase()}
            {config.panel ? " · panel of two" : ""}
          </p>

          <ul className="mt-6 space-y-3 text-[14px] text-paper-dim">
            {config.inputMode === "voice" && (
              <li className="flex gap-3">
                <Headphones className="mt-0.5 h-4 w-4 shrink-0 text-tide" /> Headphones help the interviewer hear only you.
              </li>
            )}
            <li className="flex gap-3">
              <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-tide" /> Speak naturally — they'll wait until you've finished.
            </li>
            {config.coach && (
              <li className="flex gap-3">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-tide" /> Stuck? Tap <b className="font-medium text-paper">Hint</b> — only you see it.
              </li>
            )}
          </ul>

          {blocked && (
            <p className="mt-6 rounded-2xl border border-bad/30 bg-bad/10 p-4 text-sm text-paper-dim">
              Your microphone is blocked. Allow it in the browser's address bar and reload — or go back and choose “Type” to answer
              in text.
            </p>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="glow" size="lg" onClick={onJoin} disabled={blocked || mic === "pending"}>
              Join interview <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setBreathing(true)} disabled={breathing}>
              <Wind className="h-4 w-4" /> 30-second reset
            </Button>
          </div>
          {config.camera && cam === "ok" && (
            <p className="mt-4 flex items-center gap-2 text-xs text-faint">
              <Camera className="h-3.5 w-3.5" /> Your video isn't recorded. Presence is measured on this device.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

/** Box breathing: 4 in · 4 hold · 4 out, ~30 seconds. */
function Breathe({ onDone }: { onDone: () => void }) {
  const PHASES = ["Breathe in", "Hold", "Breathe out", "Hold"];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (i >= 8) {
      onDone();
      return;
    }
    const t = setTimeout(() => setI((n) => n + 1), 4000);
    return () => clearTimeout(t);
  }, [i, onDone]);
  const phase = i % 4;
  const big = phase === 0 || phase === 1;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 grid place-items-center bg-ink-950/85 backdrop-blur-md"
    >
      <div className="relative grid h-64 w-64 place-items-center">
        <motion.span
          className="absolute rounded-full bg-tide/15"
          animate={{ width: big ? 240 : 110, height: big ? 240 : 110 }}
          transition={{ duration: 4, ease: "easeInOut" }}
        />
        <motion.span
          className="absolute rounded-full border border-tide/50"
          animate={{ width: big ? 190 : 90, height: big ? 190 : 90 }}
          transition={{ duration: 4, ease: "easeInOut" }}
        />
        <AnimatePresence mode="wait">
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="relative text-lg font-medium text-tide"
          >
            {PHASES[phase]}
          </motion.p>
        </AnimatePresence>
      </div>
      <button onClick={onDone} className="absolute bottom-5 text-xs text-mute hover:text-paper">
        Skip
      </button>
    </motion.div>
  );
}
