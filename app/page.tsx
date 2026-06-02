"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Eye, AudioLines, Gauge, Quote } from "lucide-react";
import { Reveal, EASE } from "@/components/ui/Reveal";

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
  },
  {
    icon: Eye,
    title: "It watches",
    body: "Every few seconds it reads your eye contact, posture and expression — and lets what it sees shape what it asks next.",
  },
  {
    icon: Gauge,
    title: "It adapts",
    body: "Three strong answers and it turns up the heat. A shaky one and it probes deeper. Difficulty is never fixed.",
  },
];

/* ──────────────────────────────── Page ──────────────────────────────────── */

export default function LandingPage() {
  return (
    <main className="relative min-h-screen bg-cream grain">
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
          <Link href="/setup" className="text-sm font-medium underline-offset-4 hover:underline">
            Start →
          </Link>
        </motion.div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-20 pt-10 sm:px-10 sm:pt-16">
        <Reveal onView={false} delay={0.05}>
          <p className="eyebrow text-muted">Real-time · Multimodal · Unscripted</p>
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
            <Link href="/setup" className="btn-primary group text-lg">
              Start Interview
              <ArrowUpRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
            <p className="text-sm text-muted">
              10–30 min · Camera + mic · No sign-up
            </p>
          </motion.div>
        </div>
      </section>

      <Marquee />

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
              className="group bg-cream p-8 transition-colors duration-300 hover:bg-paper sm:p-10"
            >
              <div className="display text-5xl font-semibold text-line transition-colors duration-300 group-hover:text-accent">
                {s.n}
              </div>
              <h3 className="mt-6 text-xl font-semibold">{s.title}</h3>
              <p className="mt-3 leading-relaxed text-ink-soft">{s.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Pull quote */}
      <section className="relative z-10 border-y border-line bg-paper">
        <div className="mx-auto max-w-5xl px-6 py-24 text-center sm:px-10">
          <Reveal>
            <Quote className="mx-auto h-8 w-8 text-accent" />
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
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-paper text-ink">
                <c.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-6 text-2xl font-semibold">{c.title}</h3>
              <p className="mt-3 leading-relaxed text-ink-soft">{c.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-28 sm:px-10">
        <Reveal className="overflow-hidden rounded-card border border-line bg-ink px-8 py-16 text-cream sm:px-16 sm:py-20">
          <div className="grid gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-center">
            <h2 className="display text-4xl font-semibold leading-tight sm:text-6xl">
              Ready when you are.
            </h2>
            <div className="flex flex-col items-start gap-4 md:items-end">
              <p className="max-w-sm text-cream/70 md:text-right">
                Set up takes a minute. The interview takes as long as you choose.
                The feedback lasts.
              </p>
              <Link
                href="/setup"
                className="group inline-flex items-center gap-2 rounded-full bg-cream px-7 py-4 text-lg font-medium text-ink transition-transform duration-300 hover:-translate-y-0.5"
              >
                Start Interview
                <ArrowUpRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
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
