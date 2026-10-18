"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, AudioLines, BookOpenCheck, Flame, Gauge, Mic, Sparkles, Timer, TrendingUp } from "lucide-react";
import { AuraOrb } from "@/components/aura/AuraOrb";
import { Meter, TrendChart } from "@/components/report/Viz";
import { SessionRow } from "@/components/SessionRow";
import { Badge, Button, Card, EmptyState, Eyebrow } from "@/components/ui/kit";
import { listPreps, listSessions, type PrepRecord, type SessionRecord } from "@/lib/client/db";
import { dimensionAverages, readiness, scored, streak, WEAKSPOT_FOCUS, weakestDimension } from "@/lib/client/insights";
import { useApp } from "@/lib/client/store";
import { timeAgo } from "@/lib/cn";
import { DIMENSIONS, DIMENSION_LABELS, FORMAT_META } from "@/types/interview";

const EASE = [0.16, 1, 0.3, 1] as const;

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Home() {
  const { profile, access } = useApp();
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [preps, setPreps] = useState<PrepRecord[]>([]);

  useEffect(() => {
    void listSessions().then(setSessions);
    void listPreps().then(setPreps);
  }, []);

  const all = sessions ?? [];
  const done = scored(all);
  const ready = readiness(all);
  const days = streak(all);
  const avg = dimensionAverages(all);
  const weak = weakestDimension(all);
  const last = done[0];
  const trend = useMemo(
    () =>
      done
        .slice(0, 10)
        .reverse()
        .map((s) => ({ label: new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: s.feedback!.overallScore })),
    [done]
  );
  const minutesLeft = access?.limits.minutesPerMonth != null ? Math.max(0, Math.floor(access.limits.minutesPerMonth - access.usage.minutes)) : null;

  const nextUp = last?.feedback?.nextSession
    ? {
        title: `${FORMAT_META[last.feedback.nextSession.format]?.label ?? "Quick drill"}`,
        body: last.feedback.nextSession.focus,
        href: `/practice?format=${last.feedback.nextSession.format}&focus=${encodeURIComponent(last.feedback.nextSession.focus)}`,
      }
    : {
        title: all.length ? "Five-minute warm-up" : "Your first session",
        body: all.length
          ? "Three quick questions to get your voice going."
          : "A short, friendly warm-up so you can feel how it works. About five minutes.",
        href: "/practice?first=1",
      };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}>
        <Eyebrow>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</Eyebrow>
        <h1 className="display mt-3 text-[clamp(2.6rem,5.5vw,4.25rem)]">
          {greeting()}, <span className="italic text-ember-grad">{profile?.name || "friend"}</span>.
        </h1>
        <p className="mt-3 text-[15px] text-mute">
          {ready != null
            ? `Your readiness for ${profile?.targetRole || "your next interview"} is ${ready}. ${ready >= 75 ? "You're in great shape — keep it warm." : "Every session moves it up."}`
            : "Let's get your first practice in. It gets easier every time — that's the whole idea."}
        </p>
      </motion.div>

      {/* next up */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
        className="glass relative overflow-hidden rounded-xl3"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_50%,rgba(255,138,76,0.14),transparent_55%)]" />
        <div className="relative grid items-center gap-2 sm:grid-cols-[1fr_auto]">
          <div className="p-7 sm:p-9">
            <Badge tone="ember">
              <Sparkles className="h-3 w-3" /> Next up for you
            </Badge>
            <h2 className="mt-4 text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight">{nextUp.title}</h2>
            <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-paper-dim">{nextUp.body}</p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Button variant="glow" size="lg" href={nextUp.href}>
                <Mic className="h-4 w-4" /> Start now
              </Button>
              <Button variant="secondary" size="lg" href="/practice">
                Choose something else
              </Button>
            </div>
          </div>
          <div className="hidden h-64 w-72 sm:block">
            <AuraOrb mood="idle" energy={0.3} scale={0.85} interactive className="h-full w-full" />
          </div>
        </div>
      </motion.section>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Gauge className="h-4 w-4" />} label="Readiness" value={ready ?? "—"} note={ready != null ? "weighted to recent sessions" : "after your first session"} />
        <Stat icon={<AudioLines className="h-4 w-4" />} label="Sessions" value={all.filter((s) => s.status === "complete" || s.status === "unscored").length} note={done.length ? `best ${Math.max(...done.map((s) => s.feedback!.overallScore))}` : "let's begin"} />
        <Stat icon={<Flame className="h-4 w-4" />} label="Streak" value={days} unit={days === 1 ? "day" : "days"} note={days ? "keep it going" : "practice today to start one"} />
        <Stat icon={<Timer className="h-4 w-4" />} label="Minutes left" value={minutesLeft ?? "∞"} note="this month" />
      </div>

      {sessions && done.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold">Overall score</h2>
              <span className="text-xs text-faint">last {trend.length} sessions</span>
            </div>
            <div className="mt-4">
              <TrendChart points={trend} />
            </div>
          </Card>
          <Card>
            <h2 className="text-[15px] font-semibold">Your skills</h2>
            <div className="mt-5 space-y-4">
              {avg && DIMENSIONS.map((d, i) => <Meter key={d} label={DIMENSION_LABELS[d]} value={avg[d]} delay={i * 0.06} />)}
            </div>
            {weak && (
              <Link
                href={`/practice?format=weakspot&focus=${encodeURIComponent(`Focus area: ${DIMENSION_LABELS[weak]}. ${WEAKSPOT_FOCUS[weak]}`)}`}
                className="mt-6 flex items-center justify-between rounded-2xl border border-ember/25 bg-ember/[0.05] px-4 py-3 text-sm transition hover:bg-ember/[0.09]"
              >
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-ember-soft" /> Work on <b className="font-medium">{DIMENSION_LABELS[weak].toLowerCase()}</b>
                </span>
                <ArrowRight className="h-4 w-4 text-ember-soft" />
              </Link>
            )}
          </Card>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">Recent sessions</h2>
            {all.length > 0 && (
              <Link href="/history" className="text-xs text-mute hover:text-paper">
                See all →
              </Link>
            )}
          </div>
          <div className="mt-4 space-y-2">
            {all.length ? (
              all.slice(0, 4).map((s) => <SessionRow key={s.id} s={s} />)
            ) : (
              <EmptyState icon={<Mic className="h-5 w-5" />} title="No sessions yet" body="Your reports will collect here, so you can watch yourself improve." />
            )}
          </div>
        </Card>
        <Card>
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">Prep packs</h2>
            <Link href="/prep" className="text-xs text-mute hover:text-paper">
              {preps.length ? "See all →" : "Make one →"}
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {preps.length ? (
              preps.slice(0, 3).map((p) => (
                <Link key={p.id} href={`/prep/${p.id}`} className="flex items-center gap-3 rounded-2xl border hairline bg-white/[0.02] px-4 py-3.5 transition hover:bg-white/[0.04]">
                  <BookOpenCheck className="h-4 w-4 text-iris" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">
                      {p.role}
                      {p.company ? ` · ${p.company}` : ""}
                    </span>
                    <span className="block text-xs text-mute">
                      {p.pack.questions.length} questions · {timeAgo(p.createdAt)}
                    </span>
                  </span>
                </Link>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-mute">
                Got a real interview coming up? Paste the job post and get the questions they'll likely ask — with answers built from your
                own experience.
                <Button href="/prep" variant="secondary" size="sm" className="mt-4">
                  <BookOpenCheck className="h-3.5 w-3.5" /> Build a prep pack
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  unit,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  note?: string;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <p className="flex items-center gap-2 text-xs text-mute">
        <span className="text-paper-dim">{icon}</span> {label}
      </p>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tabular-nums tracking-tight">{value}</span>
        {unit && <span className="text-sm text-mute">{unit}</span>}
      </p>
      {note && <p className="mt-1 text-xs text-faint">{note}</p>}
    </div>
  );
}
