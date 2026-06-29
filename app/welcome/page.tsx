"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Volume2, Sparkles, Loader2 } from "lucide-react";
import { loadKeys } from "@/lib/keys";
import { useIntroSpeech, type IntroLine } from "@/hooks/useIntroSpeech";
import type { AvatarState } from "@/components/avatar/useAvatarControls";

const AvatarCanvas = dynamic(
  () => import("@/components/avatar/AvatarCanvas").then((m) => m.AvatarCanvas),
  { ssr: false, loading: () => <div className="h-full w-full" /> },
);

const INTRO_SEEN_KEY = "interviewiq_intro_seen";

/** Spoken lines — captions show this exact text in sync with the voice. */
const LINES: IntroLine[] = [
  { text: "Hey — welcome to InterviewIQ. I'm really glad you're here." },
  { text: "I'm the interviewer you get to practice with — as many times as you want, with nothing on the line." },
  { text: "And I can be whoever you need. Warm and patient when you're just getting started…" },
  { text: "…or sharp, relentless, and hard to impress when you're ready to be pushed." },
  { text: "I'll listen closely, watch how you carry yourself, and give you honest feedback that makes you better." },
  { text: "Alright — let's get you set up." },
];

const PERSONA_CHIPS = [
  { label: "Friendly", color: "#6ee7b7" },
  { label: "Tough", color: "#fcd34d" },
  { label: "Brutal", color: "#fca5a5" },
];

type Phase = "gate" | "preparing" | "playing" | "done";

export default function WelcomePage() {
  const router = useRouter();
  const keyRef = useRef<string>("");
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("preparing");
  const [lineIdx, setLineIdx] = useState(-1);
  const [leaving, setLeaving] = useState(false);
  const startedRef = useRef(false);

  // Resolve keys once on mount (client only).
  const keys = useRef(loadKeys());
  const { playScript, stop, resume, speaking, getAmplitude, getMouthShape } =
    useIntroSpeech(keys.current.elevenlabs ?? "");

  const goSetup = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    try {
      localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch { /* ignore */ }
    stop();
    router.push("/setup");
  }, [router, stop, leaving]);

  const runScript = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase("preparing");
    await playScript(LINES, (i) => {
      setLineIdx(i);
      setPhase("playing");
    });
    setPhase("done");
  }, [playScript]);

  // Mount: guard, then try to auto-start (audio was unlocked on the keys click).
  useEffect(() => {
    keyRef.current = keys.current.elevenlabs ?? "";
    let seen = false;
    try {
      seen = !!localStorage.getItem(INTRO_SEEN_KEY);
    } catch { /* ignore */ }

    if (seen || !keyRef.current) {
      router.replace("/setup");
      return;
    }
    setReady(true);

    (async () => {
      const running = await resume();
      if (running) {
        runScript();
      } else {
        setPhase("gate");
      }
    })();

    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const avatarState: AvatarState = speaking
    ? "speaking"
    : phase === "preparing"
      ? "thinking"
      : phase === "playing"
        ? "listening"
        : "idle";

  const showChips = phase === "playing" && (lineIdx === 2 || lineIdx === 3);
  const caption = lineIdx >= 0 ? LINES[lineIdx].text : "";

  if (!ready) {
    return <div className="min-h-[100dvh] bg-charcoal-deep" />;
  }

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-charcoal-deep text-cream">
      {/* Cinematic backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 32%, #2c2c33 0%, #1b1b1e 52%, #121214 100%)",
        }}
      />
      {/* Grain */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      {/* Vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: "inset 0 0 220px 60px rgba(0,0,0,0.55)" }}
      />

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-7 py-6">
        <p className="display text-lg font-semibold tracking-tight text-cream/85">
          Interview<span style={{ color: "var(--accent-ink, #c9b48a)" }}>IQ</span>
        </p>
        {phase !== "done" && (
          <button
            onClick={goSetup}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-cream/40 backdrop-blur-sm transition-all hover:border-white/20 hover:text-cream/70"
          >
            Skip intro
          </button>
        )}
      </div>

      {/* Avatar + halo */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative h-full w-full max-w-3xl">
          {/* Pulsing halo */}
          <motion.div
            className="pointer-events-none absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: 460,
              height: 460,
              background:
                "radial-gradient(circle, rgba(201,180,138,0.12) 0%, transparent 66%)",
            }}
            animate={{
              scale: speaking ? [1, 1.1, 1] : [1, 1.04, 1],
              opacity: speaking ? [0.6, 1, 0.6] : [0.35, 0.6, 0.35],
            }}
            transition={{
              duration: speaking ? 0.8 : 3.4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <AvatarCanvas
            state={avatarState}
            variant="male"
            getAmplitude={getAmplitude}
            getMouthShape={getMouthShape}
            className="absolute inset-0 h-full w-full"
          />
        </div>
      </div>

      {/* Eyebrow */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.8 }}
        className="absolute left-7 top-[76px] z-10"
      >
        <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.32em] text-cream/35">
          <Volume2 className="h-3.5 w-3.5" />
          {phase === "done" ? "You're all set" : "A quick hello from your interviewer"}
        </p>
      </motion.div>

      {/* Caption + chips + CTA */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-6 pb-14">
        {/* Persona chips during the "I can be whoever you need" beat */}
        <div className="mb-6 h-9">
          <AnimatePresence>
            {showChips && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.5 }}
                className="flex items-center gap-2.5"
              >
                {PERSONA_CHIPS.map((c, i) => (
                  <motion.span
                    key={c.label}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.14, duration: 0.4 }}
                    className="rounded-full border px-4 py-1.5 text-xs font-medium backdrop-blur-sm"
                    style={{
                      color: c.color,
                      borderColor: `${c.color}40`,
                      background: `${c.color}12`,
                    }}
                  >
                    {c.label}
                  </motion.span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Caption */}
        <div className="flex min-h-[88px] max-w-2xl items-center justify-center text-center">
          <AnimatePresence mode="wait">
            {phase === "gate" ? (
              <motion.button
                key="gate"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                onClick={async () => {
                  await resume();
                  runScript();
                }}
                className="group flex items-center gap-2.5 rounded-full px-8 py-4 text-base font-semibold text-[#0a0a0c] transition-transform duration-200 hover:scale-[1.03]"
                style={{ background: "var(--accent, #c9b48a)" }}
              >
                <Sparkles className="h-4 w-4" />
                Meet your interviewer
              </motion.button>
            ) : phase === "preparing" ? (
              <motion.p
                key="preparing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm text-cream/45"
              >
                Warming up his voice…
              </motion.p>
            ) : (
              <motion.p
                key={lineIdx}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                className="display text-[clamp(1.4rem,3.6vw,2.1rem)] font-medium leading-snug text-cream/92"
              >
                {caption}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* CTA on finish */}
        <div className="mt-9 h-14">
          <AnimatePresence>
            {phase === "done" && (
              <motion.button
                initial={{ opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.25, duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                onClick={goSetup}
                disabled={leaving}
                className="group flex items-center gap-2.5 rounded-full px-9 py-4 text-base font-semibold text-[#0a0a0c] transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98] disabled:opacity-80"
                style={{ background: "var(--accent, #c9b48a)" }}
              >
                {leaving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Setting up…</>
                ) : (
                  <>
                    Let&apos;s set up your interview
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </>
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Progress dots */}
        {phase !== "gate" && (
          <div className="mt-8 flex gap-1.5">
            {LINES.map((_, i) => (
              <motion.div
                key={i}
                className="rounded-full"
                animate={{
                  width: i === lineIdx ? 22 : 6,
                  background:
                    i <= lineIdx
                      ? "rgba(201,180,138,0.85)"
                      : "rgba(255,255,255,0.16)",
                }}
                style={{ height: 6 }}
                transition={{ duration: 0.3 }}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
