"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { ArrowUpRight, Eye, AudioLines, Gauge, Quote, Clock, BarChart2 } from "lucide-react";
import { Reveal, EASE } from "@/components/ui/Reveal";
import { LoadingLink } from "@/components/ui/LoadingLink";
import { loadHistory, type HistoryEntry } from "@/lib/persistence";
import { cn } from "@/lib/utils";

/* ─────────────────────── Reusable motion primitives ─────────────────────── */

/** A live equalizer — the app's "I'm listening" signature, used in the orb. */
function Waveform({ bars = 7, className }: { bars?: number; className?: string }) {
  // A <span> (not <div>) so it's valid inside the eyebrow <p> — avoids the
  // browser hoisting it out and breaking hydration.
  return (
    <span className={cn("inline-flex items-end gap-[3px]", className)}>
      {Array.from({ length: bars }).map((_, i) => (
        <motion.span
          key={i}
          className="block w-[3px] rounded-full bg-accent"
          animate={{ height: [7, 22, 11, 26, 9, 18, 7] }}
          transition={{
            duration: 1.3 + (i % 3) * 0.22,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.09,
          }}
        />
      ))}
    </span>
  );
}

/** Slow-drifting amber light behind everything — sets an atmosphere. */
function AmbientBackground() {
  const blobs = [
    { cls: "left-[-12%] top-[-8%] h-[540px] w-[540px]", c: "rgba(245,158,11,0.18)", dur: 22, x: [0, 50, 0], y: [0, 34, 0] },
    { cls: "right-[-10%] top-[14%] h-[480px] w-[480px]", c: "rgba(180,83,9,0.13)", dur: 28, x: [0, -36, 0], y: [0, 46, 0] },
    { cls: "left-[28%] bottom-[-16%] h-[600px] w-[600px]", c: "rgba(245,158,11,0.10)", dur: 34, x: [0, 26, 0], y: [0, -34, 0] },
  ];
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={cn("absolute rounded-full blur-3xl", b.cls)}
          style={{ background: `radial-gradient(circle, ${b.c}, transparent 70%)` }}
          animate={{ x: b.x, y: b.y, scale: [1, 1.12, 1] }}
          transition={{ duration: b.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

/** Deterministic motes that rise through the hero (no SSR randomness). */
const PARTICLES = [
  { l: "8%", s: 4, dur: 15, d: 0 }, { l: "21%", s: 3, dur: 19, d: 3 },
  { l: "34%", s: 5, dur: 13, d: 6 }, { l: "47%", s: 3, dur: 21, d: 1.5 },
  { l: "60%", s: 4, dur: 16, d: 4.5 }, { l: "72%", s: 3, dur: 23, d: 2 },
  { l: "84%", s: 5, dur: 14, d: 7 }, { l: "92%", s: 3, dur: 18, d: 5 },
];
function FloatingParticles() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {PARTICLES.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-accent/40"
          style={{ left: p.l, bottom: -12, width: p.s, height: p.s }}
          animate={{ y: [0, -560], opacity: [0, 0.7, 0] }}
          transition={{ duration: p.dur, repeat: Infinity, ease: "linear", delay: p.d }}
        />
      ))}
    </div>
  );
}

/** The hero centrepiece — a living "interviewer is listening" orb. */
function LiveOrb() {
  return (
    <div className="relative h-[280px] w-[280px]">
      {/* glow */}
      <motion.div
        className="absolute inset-0 rounded-full blur-2xl"
        style={{ background: "radial-gradient(circle, rgba(245,158,11,0.32), transparent 70%)" }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.55, 0.9, 0.55] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* expanding pulse rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-7 rounded-full border border-accent/40"
          animate={{ scale: [1, 1.55], opacity: [0.5, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeOut", delay: i * 1.05 }}
        />
      ))}
      {/* counter-rotating scanner rings */}
      <motion.svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full"
        animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }}>
        <circle cx="50" cy="50" r="47" fill="none" stroke="var(--accent)" strokeOpacity="0.4" strokeWidth="0.5" strokeDasharray="2 6" />
      </motion.svg>
      <motion.svg viewBox="0 0 100 100" className="absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)]"
        animate={{ rotate: -360 }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }}>
        <circle cx="50" cy="50" r="45" fill="none" stroke="#111" strokeOpacity="0.08" strokeWidth="0.5" strokeDasharray="1 9" />
      </motion.svg>
      {/* orbiting spark */}
      <motion.div className="absolute inset-0" animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}>
        <span className="absolute left-1/2 top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-accent"
          style={{ boxShadow: "0 0 14px var(--accent)" }} />
      </motion.div>
      {/* core */}
      <div className="absolute inset-[27%] flex items-center justify-center rounded-full border border-line bg-paper shadow-lift">
        <Waveform bars={7} />
      </div>
      {/* status chip */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.6 }}
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-paper/90 px-3.5 py-1.5 text-xs font-medium text-ink-soft shadow-soft backdrop-blur"
      >
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
        Listening · watching · adapting
      </motion.div>
    </div>
  );
}

/* ───────────────────────────── Hero headline ────────────────────────────── */

const HERO_LINES = [
  [{ t: "An interview that" }],
  [{ t: "sees you", accent: true }, { t: ", hears you," }],
  [{ t: "and pushes back." }],
];

function HeroHeadline() {
  return (
    <h1 className="display text-[clamp(2.6rem,8.5vw,7.5rem)] font-semibold text-ink">
      {HERO_LINES.map((line, i) => (
        <span key={i} className="block overflow-hidden">
          <motion.span
            className="block"
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            transition={{ duration: 1, ease: EASE, delay: 0.15 + i * 0.12 }}
          >
            {line.map((seg, j) => (
              <span
                key={j}
                className={seg.accent ? "italic accent-underline" : undefined}
                style={seg.accent ? { color: "var(--accent-ink)" } : undefined}
              >
                {seg.t}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </h1>
  );
}

/* ─────────────────────────────── Marquee ────────────────────────────────── */

const MARQUEE = [
  "Real-time voice",
  "Live vision",
  "Adaptive difficulty",
  "Resume-aware",
  "Honest feedback",
  "No script",
];

function Marquee() {
  return (
    <div className="relative flex overflow-hidden border-y border-line bg-paper py-5 select-none">
      <div className="flex shrink-0 animate-marquee whitespace-nowrap">
        {[0, 1].map((dup) => (
          <div key={dup} className="flex items-center" aria-hidden={dup === 1}>
            {MARQUEE.map((w) => (
              <span key={w} className="flex items-center">
                <span className="px-8 text-lg font-medium tracking-tight text-ink-soft">
                  {w}
                </span>
                <span className="text-accent">✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────── Stats band ──────────────────────────────── */

const STATS: { value: number; suffix?: string; display?: string; label: string }[] = [
  { value: 5, label: "Dimensions scored" },
  { value: 4, label: "Difficulty levels" },
  { value: 30, suffix: " min", label: "Up to, per session" },
  { value: 0, display: "∞", label: "Free practice runs" },
];

function Stat({ value, suffix, display, label }: (typeof STATS)[number]) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView || display) return;
    let raf = 0;
    const start = performance.now();
    const dur = 1200;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(eased * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, display]);

  return (
    <div ref={ref} className="text-center">
      <div className="display text-5xl font-semibold text-ink sm:text-6xl">
        <span style={{ color: "var(--accent-ink)" }}>
          {display ?? n}
          {suffix}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">{label}</p>
    </div>
  );
}

function StatsBand() {
  return (
    <section className="relative z-10 mx-auto max-w-7xl px-6 py-16 sm:px-10">
      <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
        {STATS.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.08}>
            <Stat {...s} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── How it works ───────────────────────────────── */

const STEPS = [
  {
    n: "01",
    title: "Bring your story",
    body: "Drop in your resume, cover letter and the job description. The interviewer reads everything before you sit down.",
  },
  {
    n: "02",
    title: "Sit the interview",
    body: "An animated interviewer speaks, listens to your answers and watches your camera — adapting every question in real time.",
  },
  {
    n: "03",
    title: "Hear the truth",
    body: "The moment it ends, you get a scored, dimension-by-dimension breakdown and three things to fix. No flattery.",
  },
];

/* ─────────────────────────── Capabilities ───────────────────────────────── */

const CAPS = [
  {
    icon: AudioLines,
    title: "It listens",
    body: "Streaming speech recognition means you just talk. No buttons, no “submit.” It hears you finish and responds.",
    anim: { scaleY: [1, 1.35, 0.8, 1] },
  },
  {
    icon: Eye,
    title: "It watches",
    body: "Every few seconds it reads your eye contact, posture and expression — and lets what it sees shape what it asks next.",
    anim: { scale: [1, 1.15, 1], rotate: [0, -6, 6, 0] },
  },
  {
    icon: Gauge,
    title: "It adapts",
    body: "Three strong answers and it turns up the heat. A shaky one and it probes deeper. Difficulty is never fixed.",
    anim: { rotate: [-8, 8, -8] },
  },
];

/* ──────────────────────────── History strip ─────────────────────────────── */

const GRADE_COLOR: Record<string, string> = {
  "A+": "#22c55e", A: "#22c55e", "A-": "#4ade80",
  "B+": "#84cc16", B: "#84cc16", "B-": "#a3e635",
  "C+": "#eab308", C: "#eab308", "C-": "#facc15",
  D: "#f97316", F: "#ef4444",
};

function HistoryStrip({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) return null;
  return (
    <Reveal className="relative z-10 mx-auto max-w-7xl px-6 pb-2 sm:px-10">
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <span className="shrink-0 text-xs font-medium uppercase tracking-widest text-muted">
          Your sessions
        </span>
        {entries.map((e) => (
          <Link
            key={e.id}
            href="/feedback"
            className="group flex shrink-0 items-center gap-3 rounded-full border border-line bg-paper px-4 py-2 text-sm transition-all hover:-translate-y-0.5 hover:border-ink/30 hover:shadow-soft"
          >
            <span className="font-semibold" style={{ color: GRADE_COLOR[e.grade] ?? "#888" }}>
              {e.grade}
            </span>
            <span className="text-ink-soft">{e.score}/100</span>
            <span className="flex items-center gap-1 text-muted">
              <Clock className="h-3 w-3" />
              {new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </Link>
        ))}
        <LoadingLink
          href="/keys"
          loadingLabel="Loading…"
          spinnerClassName="h-3.5 w-3.5"
          className="shrink-0 flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-medium text-cream transition-transform hover:-translate-y-0.5"
        >
          <BarChart2 className="h-3.5 w-3.5" /> Practice again
        </LoadingLink>
      </div>
    </Reveal>
  );
}

/* ──────────────────────────────── Page ──────────────────────────────────── */

export default function LandingPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // Mandatory flow: home → keys → intro → setup → interview. Every entry point
  // goes through /keys (prefilled for returning users — one click to continue).
  const startHref = "/keys";

  useEffect(() => {
    setHistory(loadHistory().slice(0, 5));
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-cream grain">
      <AmbientBackground />

      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="display text-xl font-semibold tracking-tight">
          Interview<span style={{ color: "var(--accent-ink)" }}>IQ</span>
        </Link>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="flex items-center gap-6"
        >
          <span className="hidden items-center gap-2 text-sm text-muted sm:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            Live AI interviewer
          </span>
          <Link href="/keys" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
            API keys
          </Link>
          <Link href={startHref} className="text-sm font-medium underline-offset-4 hover:underline">
            Start →
          </Link>
        </motion.div>
      </header>

      {history.length > 0 && <HistoryStrip entries={history} />}

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-20 pt-10 sm:px-10 sm:pt-16">
        <FloatingParticles />

        {/* Floating orb visual (large screens) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 1, ease: EASE }}
          className="pointer-events-none absolute right-6 top-2 z-0 hidden xl:block"
        >
          <LiveOrb />
        </motion.div>

        <div className="relative z-10">
          <Reveal onView={false} delay={0.05}>
            <p className="eyebrow flex items-center gap-3 text-muted">
              Real-time · Multimodal · Unscripted
              <Waveform bars={4} className="h-4" />
            </p>
          </Reveal>

          <div className="mt-6">
            <HeroHeadline />
          </div>

          <div className="mt-10 grid gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-end">
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.9, ease: EASE }}
              className="max-w-xl text-pretty text-lg leading-relaxed text-ink-soft"
            >
              InterviewIQ runs a live mock interview with an AI that speaks,
              listens and watches — then tells you the truth about how you did.
              Once it begins, you never touch the keyboard again.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85, duration: 0.9, ease: EASE }}
              className="flex flex-col items-start gap-4 md:items-end"
            >
              <LoadingLink href={startHref} loadingLabel="Starting…" className="btn-primary group text-lg">
                Start Interview
                <ArrowUpRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </LoadingLink>
              <p className="text-sm text-muted">10–30 min · Camera + mic · No sign-up</p>
            </motion.div>
          </div>
        </div>
      </section>

      <Marquee />

      <StatsBand />

      {/* How it works */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 py-24 sm:px-10">
        <Reveal>
          <p className="eyebrow text-muted">How it works</p>
          <h2 className="display mt-3 max-w-2xl text-4xl font-semibold sm:text-5xl">
            Three steps. Then it’s out of your hands.
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal
              key={s.n}
              delay={i * 0.1}
              className="group relative bg-cream p-8 transition-colors duration-300 hover:bg-paper sm:p-10"
            >
              <div className="display text-5xl font-semibold text-line transition-all duration-300 group-hover:scale-110 group-hover:text-accent">
                {s.n}
              </div>
              <h3 className="mt-6 text-xl font-semibold">{s.title}</h3>
              <p className="mt-3 leading-relaxed text-ink-soft">{s.body}</p>
              <div className="mt-6 h-px w-0 bg-accent transition-all duration-500 group-hover:w-full" />
            </Reveal>
          ))}
        </div>
      </section>

      {/* Pull quote */}
      <section className="relative z-10 border-y border-line bg-paper">
        <div className="mx-auto max-w-5xl px-6 py-24 text-center sm:px-10">
          <Reveal>
            <motion.div
              animate={{ rotate: [0, -6, 6, 0], scale: [1, 1.08, 1] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <Quote className="mx-auto h-8 w-8 text-accent" />
            </motion.div>
            <blockquote className="display mt-8 text-balance text-3xl font-medium leading-tight sm:text-5xl">
              “It’s not a chatbot with a face. It’s a room you walk into — and
              the room is paying attention.”
            </blockquote>
          </Reveal>
        </div>
      </section>

      {/* Capabilities */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 py-24 sm:px-10">
        <div className="grid gap-12 md:grid-cols-3">
          {CAPS.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.1}>
              <div className="group rounded-card p-6 transition-all duration-300 hover:-translate-y-1.5 hover:bg-paper hover:shadow-lift">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-paper text-ink transition-colors duration-300 group-hover:border-accent group-hover:bg-accent group-hover:text-cream">
                  <motion.span
                    animate={c.anim}
                    transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }}
                    className="inline-flex"
                  >
                    <c.icon className="h-5 w-5" />
                  </motion.span>
                </div>
                <h3 className="mt-6 text-2xl font-semibold">{c.title}</h3>
                <p className="mt-3 leading-relaxed text-ink-soft">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-28 sm:px-10">
        <Reveal className="relative overflow-hidden rounded-card border border-line bg-ink px-8 py-16 text-cream sm:px-16 sm:py-20">
          {/* drifting glow inside the dark panel */}
          <motion.div
            className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(245,158,11,0.45), transparent 70%)" }}
            animate={{ x: [0, -30, 0], y: [0, 24, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative grid gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-center">
            <h2 className="display text-4xl font-semibold leading-tight sm:text-6xl">
              Ready when you are.
            </h2>
            <div className="flex flex-col items-start gap-4 md:items-end">
              <p className="max-w-sm text-cream/70 md:text-right">
                Set up takes a minute. The interview takes as long as you choose.
                The feedback lasts.
              </p>
              <LoadingLink
                href={startHref}
                loadingLabel="Starting…"
                className="group inline-flex items-center gap-2 rounded-full bg-cream px-7 py-4 text-lg font-medium text-ink transition-transform duration-300 hover:-translate-y-0.5"
              >
                Start Interview
                <ArrowUpRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </LoadingLink>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-6 py-10 text-sm text-muted sm:flex-row sm:items-center sm:px-10">
          <span className="display text-base font-semibold text-ink">
            Interview<span style={{ color: "var(--accent-ink)" }}>IQ</span>
          </span>
          <span>Built for the moment before the moment.</span>
        </div>
      </footer>
    </main>
  );
}
