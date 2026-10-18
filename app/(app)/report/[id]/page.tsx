"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleDashed,
  Copy,
  Dumbbell,
  Eye,
  MinusCircle,
  Printer,
  RotateCcw,
  Sparkles,
  ThumbsUp,
  Wand2,
} from "lucide-react";
import { Meter, ScoreRing, StatTile } from "@/components/report/Viz";
import { Badge, Button, Card, Eyebrow, FullScreenLoader, useToast } from "@/components/ui/kit";
import { api } from "@/lib/client/api";
import { getSession, listSessions, putSession, type SessionRecord } from "@/lib/client/db";
import { dimensionAverages } from "@/lib/client/insights";
import { useApp } from "@/lib/client/store";
import { cn, formatClock } from "@/lib/cn";
import {
  DIMENSIONS,
  DIMENSION_LABELS,
  FORMAT_META,
  type AnswerQuality,
  type AnswerReview,
  type HiringSignal,
  type InterviewFeedback,
} from "@/types/interview";

const EASE = [0.16, 1, 0.3, 1] as const;

const SIGNAL: Record<HiringSignal, { label: string; tone: "good" | "warn" | "bad" }> = {
  strong_yes: { label: "Strong hire signal", tone: "good" },
  yes: { label: "Hire signal", tone: "good" },
  lean_yes: { label: "Leaning yes", tone: "warn" },
  lean_no: { label: "Leaning no — for now", tone: "warn" },
  no: { label: "Not yet", tone: "bad" },
};

const MOMENT: Record<string, string> = {
  absent: "Stepped out of frame",
  hand_raised: "Raised a hand",
  pointing: "Pointed off-camera",
  phone: "Phone in view",
  other_person: "Someone else in the room",
  looking_away: "Looked away for a while",
  confused: "Looked unsure after a question",
};

const QUALITY: Record<AnswerQuality, { label: string; tone: "good" | "warn" | "bad" | "neutral"; icon: typeof CheckCircle2 }> = {
  strong: { label: "Strong", tone: "good", icon: CheckCircle2 },
  solid: { label: "Solid", tone: "neutral", icon: ThumbsUp },
  weak: { label: "Needs work", tone: "warn", icon: CircleAlert },
  missed: { label: "Missed", tone: "bad", icon: MinusCircle },
};

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile } = useApp();
  const [session, setSession] = useState<SessionRecord | null | undefined>(undefined);
  const [history, setHistory] = useState<SessionRecord[]>([]);
  const [rescoring, setRescoring] = useState(false);
  const [rescoreError, setRescoreError] = useState("");

  useEffect(() => {
    void getSession(id).then((s) => setSession(s ?? null));
    void listSessions().then(setHistory);
  }, [id]);

  const baseline = useMemo(() => dimensionAverages(history.filter((s) => s.id !== id && s.createdAt < (session?.createdAt ?? Infinity))), [history, id, session]);

  const rescore = async () => {
    if (!session) return;
    setRescoring(true);
    setRescoreError("");
    try {
      const { feedback } = await api<{ feedback: InterviewFeedback }>("/api/report", {
        method: "POST",
        body: JSON.stringify({
          transcript: session.transcript,
          config: session.config,
          context: session.context,
          cv: session.cv ?? null,
          hintsUsed: session.hintsUsed ?? 0,
        }),
      });
      const ok = !(feedback.overallScore === 0 && feedback.answers.length === 0);
      const next: SessionRecord = { ...session, feedback, status: ok ? "complete" : "unscored" };
      await putSession(next);
      setSession(next);
      if (!ok) setRescoreError(feedback.summary);
    } catch (err) {
      setRescoreError((err as Error).message);
    } finally {
      setRescoring(false);
    }
  };

  if (session === undefined) return <FullScreenLoader label="Opening your report…" />;
  if (session === null)
    return (
      <div className="py-24 text-center">
        <p className="text-lg font-medium">This report isn't on this device.</p>
        <Button href="/history" className="mt-6">
          See your history
        </Button>
      </div>
    );

  const fb = session.feedback;
  const meta = (
    <p className="text-sm text-mute">
      {FORMAT_META[session.config.format].label} · {session.context.role}
      {session.context.company ? ` at ${session.context.company}` : ""} ·{" "}
      {new Date(session.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
      {session.durationSec ? ` · ${formatClock(session.durationSec)}` : ""}
    </p>
  );

  if (!fb || session.status === "unscored") {
    const answered = session.transcript.filter((t) => t.role === "candidate").length;
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <CircleDashed className="mx-auto h-10 w-10 text-mute" />
        <h1 className="display mt-6 text-5xl">Not scored yet</h1>
        <div className="mt-3">{meta}</div>
        <p className="mx-auto mt-5 max-w-md text-[15px] text-paper-dim">
          {answered
            ? `Your transcript (${answered} answer${answered === 1 ? "" : "s"}) is saved. Score it now to get your full report.`
            : fb?.summary || "There weren't any answers to score in this session."}
        </p>
        {rescoreError && <p className="mt-4 text-sm text-warn">{rescoreError}</p>}
        <div className="mt-8 flex justify-center gap-3">
          {answered > 0 && (
            <Button variant="glow" loading={rescoring} onClick={rescore}>
              <Sparkles className="h-4 w-4" /> Score this session
            </Button>
          )}
          <Button variant="secondary" href={`/practice?again=${session.id}`}>
            <RotateCcw className="h-4 w-4" /> Practice again
          </Button>
        </div>
      </div>
    );
  }

  const signal = SIGNAL[fb.hiringSignal] ?? SIGNAL.lean_no;
  const d = fb.delivery;
  const cv = fb.liveMetrics;
  const next = fb.nextSession;

  return (
    <div className="print-dark-text space-y-6">
      {/* ── hero ── */}
      <section className="glass relative overflow-hidden rounded-xl3 p-6 sm:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-ember/10 blur-3xl" />
        <div className="relative grid items-center gap-8 md:grid-cols-[auto_1fr]">
          <div className="mx-auto">
            <ScoreRing value={fb.overallScore} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="ember" className="font-mono">
                Grade {fb.grade}
              </Badge>
              <Badge tone={signal.tone}>{signal.label}</Badge>
            </div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.3 }}
              className="display mt-5 text-[clamp(1.75rem,3vw,2.6rem)] leading-[1.05]"
            >
              {fb.headline}
            </motion.h1>
            <div className="mt-3">{meta}</div>
            <p className="mt-5 max-w-2xl text-[15.5px] leading-relaxed text-paper-dim">{fb.summary}</p>
            <p className="mt-3 max-w-2xl text-sm text-mute">
              <span className="text-paper-dim">Why that signal:</span> {fb.hiringSignalReason}
            </p>
            <div className="no-print mt-7 flex flex-wrap gap-2">
              <Button variant="glow" href={`/practice?format=${next.format}&focus=${encodeURIComponent(next.focus)}`}>
                Do the recommended session <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="secondary" href={`/practice?again=${session.id}`}>
                <RotateCcw className="h-4 w-4" /> Same again
              </Button>
              <Button variant="ghost" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Save PDF
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── skills + delivery ── */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">Five skills</h2>
            {baseline && <span className="text-xs text-faint">│ marker = your recent average</span>}
          </div>
          <div className="mt-6 space-y-5">
            {DIMENSIONS.map((k, i) => (
              <Meter key={k} label={DIMENSION_LABELS[k]} value={fb.dimensions[k]} baseline={baseline?.[k]} delay={i * 0.08} />
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="text-[15px] font-semibold">How you sounded</h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {d?.wpm != null && (
              <StatTile
                label="Speaking pace"
                value={d.wpm}
                unit="wpm"
                note={d.wpm < 110 ? "A little slow — aim for 120–160" : d.wpm > 175 ? "Quick — slow down a touch" : "Comfortable pace"}
                tone={d.wpm < 110 || d.wpm > 175 ? "warn" : "good"}
              />
            )}
            <StatTile
              label="Filler words"
              value={d?.fillerPer100 ?? 0}
              unit="per 100"
              note={d?.topFillers?.length ? `Most: ${d.topFillers.map((f) => `“${f.word}”`).slice(0, 2).join(", ")}` : "Nice and clean"}
              tone={(d?.fillerPer100 ?? 0) > 4 ? "warn" : "good"}
            />
            <StatTile
              label="Average answer"
              value={d?.avgAnswerWords ?? 0}
              unit="words"
              note={(d?.avgAnswerWords ?? 0) < 45 ? "Short — add an example" : (d?.avgAnswerWords ?? 0) > 260 ? "Long — lead with the point" : "Good length"}
              tone={(d?.avgAnswerWords ?? 0) < 45 || (d?.avgAnswerWords ?? 0) > 260 ? "warn" : "good"}
            />
            <StatTile label="Hints used" value={d?.hintsUsed ?? 0} note={(d?.hintsUsed ?? 0) === 0 ? "All on your own" : "That's what they're for"} />
          </div>
          <div className="mt-5 rounded-2xl border hairline bg-white/[0.02] p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Eye className="h-4 w-4 text-tide" /> On camera
            </p>
            {cv ? (
              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                <Mini label="Eye contact" value={`${cv.eyeContactPct}%`} />
                <Mini label="Engagement" value={`${cv.engagement}`} />
                <Mini label="Steadiness" value={`${cv.headSteadiness}`} />
              </div>
            ) : null}
            <p className="mt-3 text-[13.5px] leading-relaxed text-mute">{fb.presence.summary || "Camera was off for this session."}</p>
            {fb.presenceEvents?.some((e) => e.kind !== "smiling" && e.kind !== "returned") && (
              <ul className="mt-4 space-y-1.5 border-t hairline pt-3">
                {fb.presenceEvents
                  .filter((e) => e.kind !== "smiling" && e.kind !== "returned")
                  .slice(0, 8)
                  .map((e, i) => (
                    <li key={i} className="flex items-center justify-between text-[13px]">
                      <span className="text-paper-dim">{MOMENT[e.kind] ?? e.kind}</span>
                      <span className="font-mono text-xs text-faint">{formatClock(e.at)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* ── strengths & improvements ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <ThumbsUp className="h-4 w-4 text-good" /> What's working
          </h2>
          <ul className="mt-5 space-y-3">
            {fb.strengths.map((s, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex gap-3 text-[14.5px] leading-relaxed text-paper-dim"
              >
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-good" /> {s}
              </motion.li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Dumbbell className="h-4 w-4 text-ember-soft" /> Three things to work on
          </h2>
          <div className="mt-5 space-y-4">
            {fb.improvements.map((im, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="rounded-2xl border hairline bg-white/[0.02] p-4"
              >
                <div className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ember/12 font-mono text-xs text-ember-soft">{i + 1}</span>
                  <div>
                    <p className="font-medium">{im.title}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-mute">{im.detail}</p>
                    <p className="mt-3 flex gap-2 text-[13.5px] text-paper-dim">
                      <span className="shrink-0 font-medium text-gold">Drill →</span> {im.drill}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── answer by answer ── */}
      <section>
        <div className="mb-4 mt-4 flex items-end justify-between">
          <div>
            <Eyebrow>Answer by answer</Eyebrow>
            <h2 className="display mt-2 text-4xl">
              How to say it <span className="italic text-ember-grad">better</span>
            </h2>
          </div>
        </div>
        <div className="space-y-3">
          {fb.answers.map((a, i) => (
            <AnswerCard key={i} a={a} index={i} defaultOpen={i === 0} name={profile?.name} />
          ))}
        </div>
      </section>

      {/* ── next ── */}
      <section className="glass relative overflow-hidden rounded-xl3 p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(255,138,76,0.12),transparent_60%)]" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Eyebrow>Your next best session</Eyebrow>
            <p className="mt-3 text-2xl font-semibold tracking-tight">
              {FORMAT_META[next.format]?.label ?? "Quick drill"} — {next.focus}
            </p>
            <p className="mt-2 text-[15px] text-mute">{next.why}</p>
          </div>
          <Button variant="glow" size="lg" className="no-print" href={`/practice?format=${next.format}&focus=${encodeURIComponent(next.focus)}`}>
            Start it <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <Transcript session={session} />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-mute">{label}</p>
    </div>
  );
}

function AnswerCard({ a, index, defaultOpen, name }: { a: AnswerReview; index: number; defaultOpen?: boolean; name?: string }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [showBetter, setShowBetter] = useState(false);
  const [toast, show] = useToast();
  const q = QUALITY[a.quality] ?? QUALITY.solid;
  return (
    <div className={cn("glass overflow-hidden rounded-2xl transition-colors", open && "border-white/15")}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-4 px-5 py-4 text-left">
        <span className="font-mono text-xs text-faint">Q{index + 1}</span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{a.question}</span>
        <Badge tone={q.tone} className="hidden sm:inline-flex">
          <q.icon className="h-3 w-3" /> {q.label}
        </Badge>
        <span className="w-8 text-right text-sm font-semibold tabular-nums">{a.score}</span>
        <ChevronDown className={cn("h-4 w-4 text-mute transition", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: EASE }} className="overflow-hidden">
            <div className="space-y-4 border-t hairline px-5 pb-5 pt-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-tide/80">{name || "You"} said</p>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-paper-dim">“{a.answer}”</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-good/[0.06] p-3.5">
                  <p className="text-xs font-medium text-good">What worked</p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-paper-dim">{a.whatWorked}</p>
                </div>
                <div className="rounded-xl bg-warn/[0.06] p-3.5">
                  <p className="text-xs font-medium text-warn">To improve</p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-paper-dim">{a.toImprove}</p>
                </div>
              </div>
              {!showBetter ? (
                <button
                  onClick={() => setShowBetter(true)}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ember/30 py-3 text-sm text-ember-soft transition hover:bg-ember/[0.05]"
                >
                  <Wand2 className="h-4 w-4 transition group-hover:rotate-12" /> Show a stronger version
                </button>
              ) : (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative rounded-xl border border-ember/25 bg-ember/[0.05] p-4">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-ember-soft">
                      <Wand2 className="h-3.5 w-3.5" /> A stronger version, in your words
                    </p>
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(a.strongerAnswer);
                        show("Copied");
                      }}
                      className="text-mute hover:text-paper"
                      aria-label="Copy stronger answer"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-paper">{a.strongerAnswer}</p>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {toast}
    </div>
  );
}

function Transcript({ session }: { session: SessionRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-0">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-6 py-5 text-left">
        <span className="text-[15px] font-semibold">Full transcript</span>
        <ChevronDown className={cn("h-4 w-4 text-mute transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t hairline px-6 py-5">
          {session.transcript.map((t, i) => (
            <p key={i} className="text-[14px] leading-relaxed">
              <span className={cn("mr-2 text-xs font-medium uppercase tracking-[0.12em]", t.role === "interviewer" ? "text-ember-soft" : "text-tide")}>
                {t.role === "interviewer" ? t.speaker || "Interviewer" : "You"}
              </span>
              <span className="text-paper-dim">{t.text}</span>
            </p>
          ))}
          <Link href={`/practice?again=${session.id}`} className="no-print inline-block pt-2 text-sm text-ember-soft hover:underline">
            Practice this again →
          </Link>
        </div>
      )}
    </Card>
  );
}
