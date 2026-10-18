"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useScroll, useTransform } from "motion/react";
import {
  ArrowRight,
  AudioLines,
  BookOpenCheck,
  Brain,
  Ear,
  HandHeart,
  KeyRound,
  Languages,
  Lightbulb,
  Lock,
  MessageSquareText,
  Mic,
  Pause,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { AuraOrb, type AuraMood } from "@/components/aura/AuraOrb";
import { Badge, Button, Eyebrow, Input, Logo, Modal } from "@/components/ui/kit";
import { accessMode, fetchConfig } from "@/lib/client/api";
import { cn } from "@/lib/cn";

const EASE = [0.16, 1, 0.3, 1] as const;

/** A scripted snippet of a real-feeling exchange, cycling under the hero orb. */
const SCRIPT: { who: "ai" | "you"; text: string; mood: AuraMood }[] = [
  { who: "ai", text: "Tell me about a time a project went sideways. What did you do?", mood: "speaking" },
  { who: "you", text: "Our launch slipped two weeks because the payments API changed, so I…", mood: "listening" },
  { who: "ai", text: "", mood: "thinking" },
  { who: "ai", text: "Interesting — you said “I”. What exactly did you own, and what was the result?", mood: "speaking" },
];

export default function Landing() {
  const [hasPass, setHasPass] = useState(false);
  const [byok, setByok] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  useEffect(() => {
    setHasPass(!!accessMode());
    fetchConfig()
      .then((c) => setByok(c.byok))
      .catch(() => {});
  }, []);

  return (
    <main className="relative overflow-x-clip">
      <Nav hasPass={hasPass} onInvite={() => setInviteOpen(true)} />
      <Hero hasPass={hasPass} byok={byok} onInvite={() => setInviteOpen(true)} />
      <Loop />
      <Formats />
      <Nerves />
      <Privacy />
      <FinalCta hasPass={hasPass} byok={byok} onInvite={() => setInviteOpen(true)} />
      <footer className="relative border-t hairline px-6 py-10 text-center text-xs text-faint">
        InterviewIQ · invite or bring your own keys · your practice data never leaves your device
      </footer>
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </main>
  );
}

/* ───────────────────────────── Nav ───────────────────────────── */

function Nav({ hasPass, onInvite }: { hasPass: boolean; onInvite: () => void }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="mx-auto mt-4 flex max-w-6xl items-center justify-between rounded-2xl border border-white/[0.06] bg-ink-900/55 px-4 py-2.5 backdrop-blur-xl sm:px-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Badge tone="ember" className="hidden sm:inline-flex">
            <Lock className="h-3 w-3" /> Private by design
          </Badge>
          {hasPass ? (
            <Button href="/home" size="sm">
              Open app <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={onInvite}>
              <KeyRound className="h-3.5 w-3.5" /> I have an invite
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

/* ───────────────────────────── Hero ───────────────────────────── */

function Hero({ hasPass, byok, onInvite }: { hasPass: boolean; byok: boolean; onInvite: () => void }) {
  const ref = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const orbY = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const orbScale = useTransform(scrollYProgress, [0, 1], [1, 0.82]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState("");
  const line = SCRIPT[step];

  // Typewriter for the scripted exchange.
  useEffect(() => {
    let i = 0;
    setTyped("");
    if (!line.text) {
      const t = setTimeout(() => setStep((s) => (s + 1) % SCRIPT.length), 1500);
      return () => clearTimeout(t);
    }
    const speed = line.who === "ai" ? 32 : 26;
    const iv = setInterval(() => {
      i++;
      setTyped(line.text.slice(0, i));
      if (i >= line.text.length) {
        clearInterval(iv);
        setTimeout(() => setStep((s) => (s + 1) % SCRIPT.length), 2200);
      }
    }, speed);
    return () => clearInterval(iv);
  }, [step, line.text, line.who]);

  // A synthetic "voice" level so the orb breathes while the scripted line types.
  const levelRef = useRef(0);
  const getLevel = () => {
    const talking = typed.length < line.text.length && line.text.length > 0;
    const t = performance.now() / 1000;
    const target = talking
      ? (line.who === "ai" ? 0.55 : 0.3) * (0.55 + 0.45 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 3.1)))
      : 0.04;
    levelRef.current += (target - levelRef.current) * 0.25;
    return levelRef.current;
  };

  return (
    <section ref={ref} className="relative min-h-[100svh] pt-28">
      {/* atmosphere */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[38%] h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,138,76,0.16),transparent_60%)] blur-2xl" />
        <div className="absolute inset-0 dot-grid mask-fade-b opacity-60" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-6 px-6 lg:grid-cols-[1.05fr_1fr]">
        <motion.div style={{ y: textY, opacity: fade }} className="relative z-10 pt-8 lg:pt-0">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE }}
          >
            <Badge tone="neutral" className="mb-7">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-good" />
              </span>
              A live interviewer that actually listens
            </Badge>
          </motion.div>
          <h1 className="display text-[clamp(3.4rem,8.4vw,7.2rem)]">
            {["Walk", "in"].map((w, i) => (
              <motion.span
                key={w}
                className="mr-[0.22em] inline-block"
                initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 1, delay: 0.1 + i * 0.08, ease: EASE }}
              >
                {w}
              </motion.span>
            ))}
            <br />
            <motion.span
              className="text-ember-grad inline-block pr-2 italic"
              initial={{ opacity: 0, y: 40, filter: "blur(12px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 1.1, delay: 0.3, ease: EASE }}
            >
              ready.
            </motion.span>
          </h1>
          <motion.p
            className="mt-7 max-w-[30rem] text-[17px] leading-relaxed text-paper-dim"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.5, ease: EASE }}
          >
            Practice out loud with an AI interviewer who reads your resume, adapts to every answer, and
            then shows you — line by line — how to say it better next time.
          </motion.p>
          <motion.div
            className="mt-9 flex flex-wrap items-center gap-3"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.62, ease: EASE }}
          >
            {hasPass ? (
              <Button href="/home" variant="glow" size="lg">
                Continue practicing <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button variant="glow" size="lg" onClick={onInvite}>
                  I have an invite <ArrowRight className="h-4 w-4" />
                </Button>
                {byok && (
                  <Button variant="secondary" size="lg" href="/keys">
                    <KeyRound className="h-4 w-4" /> Use my own keys
                  </Button>
                )}
              </>
            )}
          </motion.div>
          <motion.p
            className="mt-4 text-sm text-faint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.8 }}
          >
            No sign-up. {byok ? "Got an invite? It's free. Otherwise, bring your own API keys." : "Just your invite link."}
          </motion.p>
        </motion.div>

        <motion.div style={{ y: orbY, scale: orbScale }} className="relative -mt-6 aspect-square w-full lg:-mr-16 lg:mt-0">
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.6, ease: EASE }}
          >
            <AuraOrb mood={line.mood} getLevel={getLevel} energy={0.45} scale={1.05} interactive className="h-full w-full" />
          </motion.div>

          {/* live caption */}
          <div className="absolute inset-x-6 bottom-[6%] flex justify-center sm:inset-x-14">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              className="glass w-full max-w-md rounded-2xl px-4 py-3"
            >
              <div className="mb-1.5 flex items-center gap-2">
                {line.who === "ai" ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-ember-soft">
                    <AudioLines className="h-3 w-3" /> Maya · Hiring manager
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-tide">
                    <Mic className="h-3 w-3" /> You
                  </span>
                )}
              </div>
              <p className="min-h-[2.8em] text-[14.5px] leading-snug text-paper">
                {line.text ? (
                  <>
                    {typed}
                    <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-paper/70" />
                  </>
                ) : (
                  <span className="shimmer-text">thinking about your answer…</span>
                )}
              </p>
            </motion.div>
          </div>
        </motion.div>
      </div>

      <div className="mx-auto mt-10 grid max-w-6xl grid-cols-2 gap-px overflow-hidden rounded-2xl border hairline bg-white/[0.06] px-0 sm:grid-cols-4 lg:mt-4">
        {[
          { k: "Speaks", v: "Natural voice, in real time" },
          { k: "Listens", v: "Waits until you're done" },
          { k: "Adapts", v: "Follow-ups from your answers" },
          { k: "Coaches", v: "Rewrites your weak answers" },
        ].map((s, i) => (
          <motion.div
            key={s.k}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 + i * 0.08, duration: 0.8 }}
            className="bg-ink-900 px-5 py-4"
          >
            <p className="text-sm font-semibold">{s.k}</p>
            <p className="mt-0.5 text-[13px] text-mute">{s.v}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────────── The loop ───────────────────────────── */

function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: React.ReactNode; body?: string }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="display mt-4 text-[clamp(2.4rem,5vw,4rem)]">{title}</h2>
      {body && <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-mute">{body}</p>}
    </Reveal>
  );
}

function Loop() {
  return (
    <section className="relative px-6 py-32">
      <SectionHead
        eyebrow="Prepare · Practice · Improve"
        title={
          <>
            A coach for the <span className="italic text-ember-grad">whole</span> journey
          </>
        }
        body="Most people practice by reading questions in their head. Interviews are spoken. InterviewIQ makes you say it out loud — then makes it better."
      />
      <div className="mx-auto mt-16 grid max-w-6xl gap-5 lg:grid-cols-3">
        <Reveal delay={0}>
          <LoopCard
            n="01"
            icon={<BookOpenCheck className="h-4 w-4" />}
            title="Prepare"
            body="Paste a job post. Get the questions they'll likely ask, the stories from your resume that answer them, and the gaps to get ahead of."
          >
            <div className="space-y-2">
              {["Why do you want to work on payments?", "Walk me through a hard trade-off.", "What would your first 90 days look like?"].map(
                (q, i) => (
                  <div key={q} className="flex items-start gap-2.5 rounded-xl bg-white/[0.035] px-3 py-2.5 text-[13px]">
                    <span className="mt-0.5 font-mono text-[11px] text-ember-soft">Q{i + 1}</span>
                    <span className="text-paper-dim">{q}</span>
                  </div>
                )
              )}
            </div>
          </LoopCard>
        </Reveal>
        <Reveal delay={0.1}>
          <LoopCard
            n="02"
            icon={<AudioLines className="h-4 w-4" />}
            title="Practice"
            body="A real-time voice interview that digs into what you actually said. Stuck? Ask for a private hint, repeat the question, or pause."
          >
            <div className="flex items-end justify-center gap-[5px] py-4">
              {Array.from({ length: 28 }).map((_, i) => (
                <motion.span
                  key={i}
                  className="w-[4px] rounded-full bg-gradient-to-t from-ember to-gold"
                  animate={{ height: [8, 14 + ((i * 37) % 38), 10, 20 + ((i * 53) % 30), 8] }}
                  transition={{ duration: 1.6 + (i % 4) * 0.2, repeat: Infinity, ease: "easeInOut", delay: i * 0.04 }}
                />
              ))}
            </div>
          </LoopCard>
        </Reveal>
        <Reveal delay={0.2}>
          <LoopCard
            n="03"
            icon={<TrendingUp className="h-4 w-4" />}
            title="Improve"
            body="An honest report: scores for five skills, what worked, what to fix, and a stronger version of each answer — in your own voice."
          >
            <div className="flex items-center gap-4">
              <ScoreRingMini value={78} />
              <div className="flex-1 space-y-2">
                {[
                  ["Structure", 84],
                  ["Depth", 66],
                  ["Confidence", 79],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <div className="mb-1 flex justify-between text-[11.5px] text-mute">
                      <span>{k}</span>
                      <span className="text-paper-dim">{v}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-ember/15">
                      <motion.div
                        className="h-full rounded-full bg-ember"
                        initial={{ width: 0 }}
                        whileInView={{ width: `${v}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1.4, ease: EASE, delay: 0.3 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </LoopCard>
        </Reveal>
      </div>
    </section>
  );
}

function LoopCard({
  n,
  icon,
  title,
  body,
  children,
}: {
  n: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass group relative h-full overflow-hidden rounded-xl3 p-6 transition-transform duration-500 hover:-translate-y-1">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-ember/10 opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-100" />
      <div className="flex items-center justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-ember/12 text-ember-soft">{icon}</span>
        <span className="font-mono text-xs text-faint">{n}</span>
      </div>
      <h3 className="mt-5 text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-[14.5px] leading-relaxed text-mute">{body}</p>
      <div className="mt-6 rounded-2xl border hairline bg-ink-900/60 p-4">{children}</div>
    </div>
  );
}

function ScoreRingMini({ value }: { value: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} stroke="rgba(255,138,76,0.15)" strokeWidth="6" fill="none" />
        <motion.circle
          cx="40"
          cy="40"
          r={r}
          stroke="#ff8a4c"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          whileInView={{ strokeDashoffset: c * (1 - value / 100) }}
          viewport={{ once: true }}
          transition={{ duration: 1.6, ease: EASE }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xl font-semibold">{value}</span>
    </div>
  );
}

/* ───────────────────────────── Formats ───────────────────────────── */

const FORMATS = [
  { icon: Target, t: "Full mock interview", d: "Start to finish, tailored to the job post." },
  { icon: Sparkles, t: "Five-minute drill", d: "Three sharp questions when you're short on time." },
  { icon: MessageSquareText, t: "STAR stories", d: "Turn your experience into answers that land." },
  { icon: Brain, t: "Technical deep-dive", d: "Trade-offs, depth and how you think." },
  { icon: AudioLines, t: "Tell me about yourself", d: "Nail the first ninety seconds." },
  { icon: HandHeart, t: "Salary negotiation", d: "Rehearse asking for what you're worth." },
  { icon: TrendingUp, t: "Fix my weak spot", d: "Targets your lowest-scoring skill." },
  { icon: Lightbulb, t: "Any scenario", d: "Describe it, and rehearse it." },
];

function Formats() {
  return (
    <section className="relative px-6 py-24">
      <SectionHead eyebrow="Eight ways to practice" title={<>Whatever's next, rehearse <span className="italic">that</span></>} />
      <div className="mx-auto mt-14 grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FORMATS.map((f, i) => (
          <Reveal key={f.t} delay={(i % 4) * 0.06}>
            <div className="group relative h-full rounded-2xl border hairline bg-white/[0.02] p-5 transition-colors duration-300 hover:border-ember/30 hover:bg-ember/[0.04]">
              <f.icon className="h-5 w-5 text-mute transition-colors group-hover:text-ember-soft" />
              <p className="mt-4 font-medium">{f.t}</p>
              <p className="mt-1 text-[13.5px] leading-snug text-mute">{f.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────────── Nerves ───────────────────────────── */

function Nerves() {
  const items = [
    { icon: HandHeart, t: "Gentle mode", d: "A patient interviewer who builds you up first." },
    { icon: Lightbulb, t: "Private hints", d: "A whisper from your coach, mid-answer. Only you see it." },
    { icon: Pause, t: "Pause anytime", d: "Take a breath. The clock stops with you." },
    { icon: Ear, t: "It waits for you", d: "No interrupting. It knows when you've finished." },
    { icon: MessageSquareText, t: "Type instead", d: "No mic, shared room, or just not ready to speak? Type." },
    { icon: Languages, t: "Your language", d: "English, Hinglish, Hindi, Spanish, French, German, Portuguese." },
  ];
  return (
    <section className="relative px-6 py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
        <Reveal>
          <Eyebrow>Built for nerves</Eyebrow>
          <h2 className="display mt-4 text-[clamp(2.4rem,5vw,4rem)]">
            Practice where it's <span className="italic text-ember-grad">safe</span> to stumble.
          </h2>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-mute">
            Interviews are stressful enough. Here you can freeze, restart, ask for help and try again — as many times as
            you need — until the real one feels familiar.
          </p>
          <div className="mt-10 flex items-center gap-5">
            <div className="relative grid h-24 w-24 place-items-center">
              <span className="absolute inset-0 rounded-full bg-tide/15 animate-breathe" />
              <span className="absolute inset-4 rounded-full bg-tide/25 animate-breathe [animation-delay:0.4s]" />
              <span className="relative text-xs text-tide">breathe</span>
            </div>
            <p className="max-w-[16rem] text-sm text-mute">Every session starts with an optional 30-second reset.</p>
          </div>
        </Reveal>
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((it, i) => (
            <Reveal key={it.t} delay={i * 0.05}>
              <div className="glass h-full rounded-2xl p-5">
                <it.icon className="h-5 w-5 text-tide" />
                <p className="mt-3 font-medium">{it.t}</p>
                <p className="mt-1 text-[13.5px] leading-snug text-mute">{it.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── Privacy ───────────────────────────── */

function Privacy() {
  return (
    <section className="px-6 py-20">
      <Reveal className="glass mx-auto flex max-w-4xl flex-col items-center gap-6 rounded-xl3 p-10 text-center sm:flex-row sm:text-left">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-good/10 text-good">
          <Lock className="h-6 w-6" />
        </span>
        <div>
          <h3 className="text-xl font-semibold tracking-tight">Your practice stays yours.</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-mute">
            Your resume, transcripts and reports are saved only in this browser — there's no account and no database of
            your answers. If you bring your own API keys, they stay in your browser too and are used only for your sessions.
            Camera analysis runs on your device; you can switch the camera off entirely.
          </p>
        </div>
      </Reveal>
    </section>
  );
}

function FinalCta({ hasPass, byok, onInvite }: { hasPass: boolean; byok: boolean; onInvite: () => void }) {
  return (
    <section className="relative overflow-hidden px-6 pb-32 pt-16 text-center">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 opacity-70">
        <AuraOrb mood="idle" energy={0.2} scale={0.9} className="h-full w-full" />
      </div>
      <Reveal className="relative">
        <h2 className="display text-[clamp(2.6rem,6vw,5rem)]">
          Your next interview
          <br />
          <span className="italic text-ember-grad">starts here.</span>
        </h2>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {hasPass ? (
            <Button href="/home" variant="glow" size="lg">
              Open InterviewIQ <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <>
              <Button variant="glow" size="lg" onClick={onInvite}>
                I have an invite <ArrowRight className="h-4 w-4" />
              </Button>
              {byok && (
                <Button variant="secondary" size="lg" href="/keys">
                  <KeyRound className="h-4 w-4" /> Use my own keys
                </Button>
              )}
            </>
          )}
        </div>
      </Reveal>
    </section>
  );
}

/* ───────────────────────────── Invite modal ───────────────────────────── */

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    const m = v.match(/\/join\/([A-Za-z0-9_\-.]+)/);
    const token = m ? m[1] : v;
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
      setError("That doesn't look like an InterviewIQ invite link.");
      return;
    }
    router.push(`/join/${token}`);
  };

  return (
    <Modal open={open} onClose={onClose} title="Open your invite">
      <p className="-mt-2 mb-5 text-sm text-mute">
        Paste the invite link you were sent — that's all you need.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Input
          autoFocus
          placeholder="https://…/join/…"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
        />
        {error && <p className="text-sm text-bad">{error}</p>}
        <Button type="submit" variant="glow" className={cn("w-full")}>
          Continue <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
      <p className="mt-5 text-center text-xs text-faint">
        Running your own copy? <a href="/admin" className="text-paper-dim underline-offset-4 hover:underline">Admin sign-in</a>
      </p>
    </Modal>
  );
}
