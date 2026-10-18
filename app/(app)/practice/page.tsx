"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  AudioLines,
  BookOpenCheck,
  Brain,
  Camera,
  ChevronDown,
  FileText,
  HandHeart,
  Keyboard,
  Languages,
  Lightbulb,
  MessageSquareText,
  Mic,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Volume2,
} from "lucide-react";
import { Badge, Button, Card, Eyebrow, Field, Input, Segmented, Textarea, Toggle } from "@/components/ui/kit";
import { getSession, listPreps, listSessions, newId, putSession, type PrepRecord, type SessionRecord } from "@/lib/client/db";
import { WEAKSPOT_FOCUS, weakestDimension } from "@/lib/client/insights";
import { useApp } from "@/lib/client/store";
import { cn } from "@/lib/cn";
import {
  DEFAULT_CONFIG,
  DIMENSION_LABELS,
  FORMAT_META,
  LANGUAGE_LABELS,
  type Difficulty,
  type DurationMinutes,
  type InterviewConfig,
  type InterviewLanguage,
  type Persona,
  type PracticeFormat,
} from "@/types/interview";

const FORMAT_ICONS: Record<PracticeFormat, typeof Target> = {
  full: Target,
  drill: Sparkles,
  behavioral: MessageSquareText,
  technical: Brain,
  pitch: AudioLines,
  salary: HandHeart,
  weakspot: TrendingUp,
  custom: Lightbulb,
};

const DURATIONS: DurationMinutes[] = [5, 10, 15, 20, 30];

export default function PracticePage() {
  return (
    <Suspense>
      <Practice />
    </Suspense>
  );
}

function Practice() {
  const router = useRouter();
  const params = useSearchParams();
  const { profile, access, mode, ownKeys } = useApp();
  const canSpeak = mode !== "byok" || !!ownKeys?.deepgram;
  const canHear = mode !== "byok" || !!ownKeys?.elevenlabs;

  const [config, setConfig] = useState<InterviewConfig>({
    ...DEFAULT_CONFIG,
    inputMode: mode === "byok" && !ownKeys?.deepgram ? "text" : DEFAULT_CONFIG.inputMode,
    voiceOut: mode === "byok" && !ownKeys?.elevenlabs ? false : DEFAULT_CONFIG.voiceOut,
    language: profile?.preferredLanguage ?? "en",
    difficulty: (profile?.nerves ?? 3) >= 4 ? "gentle" : "standard",
  });
  const [role, setRole] = useState(profile?.targetRole ?? "");
  const [company, setCompany] = useState("");
  const [jd, setJd] = useState("");
  const [notes, setNotes] = useState("");
  const [useResume, setUseResume] = useState(!!profile?.resumeText);
  const [showJd, setShowJd] = useState(false);
  const [preps, setPreps] = useState<PrepRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [prepId, setPrepId] = useState<string>("");
  const [starting, setStarting] = useState(false);

  const set = <K extends keyof InterviewConfig>(k: K, v: InterviewConfig[K]) => setConfig((c) => ({ ...c, [k]: v }));

  const weak = useMemo(() => weakestDimension(sessions), [sessions]);

  useEffect(() => {
    void listPreps().then(setPreps);
    void listSessions().then(setSessions);
  }, []);

  // Presets from links: first session, weak-spot practice, a prep pack, or "practice again".
  useEffect(() => {
    if (params.get("first")) {
      setConfig((c) => ({
        ...c,
        format: "drill",
        duration: 5,
        difficulty: (profile?.nerves ?? 3) >= 3 ? "gentle" : "standard",
        persona: "warm",
      }));
    }
    const format = params.get("format") as PracticeFormat | null;
    if (format && FORMAT_META[format]) pickFormat(format);
    const focus = params.get("focus");
    if (focus) setNotes(focus);
    const prep = params.get("prep");
    if (prep) setPrepId(prep);
    const again = params.get("again");
    if (again) {
      void getSession(again).then((s) => {
        if (!s) return;
        setConfig({
          ...s.config,
          inputMode: canSpeak ? s.config.inputMode : "text",
          voiceOut: canHear ? s.config.voiceOut : false,
        });
        setRole(s.context.role);
        setCompany(s.context.company ?? "");
        setJd(s.context.jobDescription ?? "");
        setNotes(s.context.notes ?? "");
        if (s.context.jobDescription) setShowJd(true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const p = preps.find((x) => x.id === prepId);
    if (!p) return;
    setRole(p.role);
    setCompany(p.company ?? "");
    setJd(p.jobDescription ?? "");
    if (p.jobDescription) setShowJd(true);
  }, [prepId, preps]);

  function pickFormat(f: PracticeFormat) {
    setConfig((c) => ({ ...c, format: f, duration: FORMAT_META[f].minutes }));
    if (f === "weakspot" && weak && !notes) setNotes(`Focus area: ${DIMENSION_LABELS[weak]}. ${WEAKSPOT_FOCUS[weak]}`);
  }

  const minutesLeft =
    access?.limits.minutesPerMonth != null ? Math.max(0, access.limits.minutesPerMonth - access.usage.minutes) : null;
  const overBudget = minutesLeft !== null && minutesLeft < config.duration;
  const needsNotes = config.format === "custom" && notes.trim().length < 10;
  const canStart = role.trim().length > 1 && !needsNotes && (minutesLeft === null || minutesLeft >= 1);

  const start = async () => {
    setStarting(true);
    const id = newId();
    const duration =
      minutesLeft !== null && minutesLeft < config.duration
        ? (Math.max(5, DURATIONS.filter((d) => d <= minutesLeft).pop() ?? 5) as DurationMinutes)
        : config.duration;
    await putSession({
      id,
      createdAt: Date.now(),
      status: "ready",
      config: { ...config, duration },
      context: {
        role: role.trim(),
        company: company.trim() || undefined,
        jobDescription: jd.trim() || undefined,
        resumeText: useResume ? profile?.resumeText : undefined,
        notes: notes.trim() || undefined,
      },
      transcript: [],
    });
    router.push(`/interview/${id}`);
  };

  return (
    <div className="pb-24">
      <Eyebrow>New session</Eyebrow>
      <h1 className="display mt-3 text-[clamp(2.4rem,5vw,3.75rem)]">
        What do you want to <span className="italic text-ember-grad">practice?</span>
      </h1>

      {/* 1 — format */}
      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(FORMAT_META) as PracticeFormat[]).map((f) => {
          const Icon = FORMAT_ICONS[f];
          const active = config.format === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => pickFormat(f)}
              className={cn(
                "group relative overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300",
                active
                  ? "border-ember/45 bg-ember/[0.07] shadow-[0_20px_50px_-25px_rgba(255,138,76,0.6)]"
                  : "border-white/[0.08] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
              )}
            >
              {active && (
                <motion.span
                  layoutId="format-glow"
                  className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-ember/25 blur-2xl"
                />
              )}
              <div className="relative flex items-center justify-between">
                <Icon className={cn("h-5 w-5", active ? "text-ember-soft" : "text-mute")} />
                <span className="font-mono text-[11px] text-faint">{FORMAT_META[f].minutes} min</span>
              </div>
              <p className="relative mt-4 font-medium">{FORMAT_META[f].label}</p>
              <p className="relative mt-1 text-[13px] leading-snug text-mute">
                {f === "weakspot" && weak ? `Your weakest lately: ${DIMENSION_LABELS[weak]}.` : FORMAT_META[f].blurb}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        {/* 2 — context */}
        <Card className="space-y-5">
          <SectionTitle icon={<FileText className="h-4 w-4" />} title="The interview" />
          {preps.length > 0 && (
            <Field label="Use a prep pack" hint="Fills in the role, company and job post from a pack you've made.">
              <select
                value={prepId}
                onChange={(e) => setPrepId(e.target.value)}
                className="h-12 w-full rounded-2xl border border-white/10 bg-ink-800 px-4 text-[15px] text-paper outline-none focus:border-ember/50"
              >
                <option value="">None</option>
                {preps.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.role}
                    {p.company ? ` · ${p.company}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role">
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Customer Success Manager" />
            </Field>
            <Field label="Company (optional)">
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Stripe" />
            </Field>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowJd((v) => !v)}
              className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left text-sm hover:bg-white/[0.04]"
            >
              <span className="flex items-center gap-2">
                <BookOpenCheck className="h-4 w-4 text-mute" />
                Job description
                {jd.trim() ? <Badge tone="good">added</Badge> : <span className="text-faint">· optional, makes it much more realistic</span>}
              </span>
              <ChevronDown className={cn("h-4 w-4 text-mute transition", showJd && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
              {showJd && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <Textarea
                    className="mt-2 min-h-40 text-[13.5px]"
                    placeholder="Paste the job post…"
                    value={jd}
                    onChange={(e) => setJd(e.target.value)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Field
            label={config.format === "custom" ? "Describe the scenario" : config.format === "weakspot" ? "What to focus on" : "Anything to focus on? (optional)"}
            hint={
              config.format === "custom"
                ? "e.g. “A second-round panel for a nursing role at a children's hospital, focused on difficult families.”"
                : "e.g. “I always ramble on ‘tell me about yourself’” or “they'll ask about my career gap”."
            }
          >
            <Textarea
              className="min-h-24"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={config.format === "custom" ? "The interview scenario…" : "Optional"}
            />
          </Field>

          {profile?.resumeText ? (
            <Toggle
              checked={useResume}
              onChange={setUseResume}
              icon={<FileText className="h-4 w-4" />}
              label="Use my resume"
              description={profile.resumeFileName ? `${profile.resumeFileName} — the interviewer will ask about your real experience.` : "Questions will reference your real experience."}
            />
          ) : (
            <p className="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-[13px] text-mute">
              Tip: add your resume in <a href="/profile" className="text-paper-dim underline underline-offset-4">Profile</a> so questions are about your
              real experience.
            </p>
          )}
        </Card>

        <div className="space-y-6">
          {/* 3 — interviewer */}
          <Card className="space-y-5">
            <SectionTitle icon={<Users className="h-4 w-4" />} title="Your interviewer" />
            <Field label="Personality">
              <Segmented<Persona>
                value={config.persona}
                onChange={(v) => set("persona", v)}
                options={[
                  { value: "warm", label: "Warm" },
                  { value: "neutral", label: "Neutral" },
                  { value: "tough", label: "Tough" },
                  { value: "silent", label: "Poker-face" },
                ]}
              />
            </Field>
            <Field label="Difficulty">
              <Segmented<Difficulty>
                value={config.difficulty}
                onChange={(v) => set("difficulty", v)}
                options={[
                  { value: "gentle", label: "Gentle" },
                  { value: "standard", label: "Standard" },
                  { value: "challenging", label: "Hard" },
                  { value: "brutal", label: "Brutal" },
                ]}
              />
            </Field>
            <Field label="Length">
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set("duration", d)}
                    disabled={minutesLeft !== null && d > Math.max(5, minutesLeft)}
                    className={cn(
                      "h-10 flex-1 rounded-xl border text-[13.5px] font-medium transition disabled:opacity-30",
                      config.duration === d ? "border-ember/45 bg-ember/10 text-paper" : "border-white/10 text-paper-dim hover:bg-white/[0.04]"
                    )}
                  >
                    {d}m
                  </button>
                ))}
              </div>
            </Field>
            <Toggle
              checked={config.panel}
              onChange={(v) => set("panel", v)}
              icon={<Users className="h-4 w-4" />}
              label="Panel interview"
              description="Two interviewers with different voices and angles."
            />
            <Field label="Look">
              <Segmented
                value={config.avatar}
                onChange={(v) => set("avatar", v)}
                options={[
                  { value: "aura", label: "Aura" },
                  { value: "human", label: "3D human" },
                ]}
              />
            </Field>
          </Card>

          {/* 4 — how you answer */}
          <Card className="space-y-3">
            <SectionTitle icon={<Mic className="h-4 w-4" />} title="How you'll answer" />
            <Segmented
              value={config.inputMode}
              onChange={(v) => (canSpeak || v === "text") && set("inputMode", v)}
              options={[
                { value: "voice", label: <span className="flex items-center gap-1.5"><Mic className="h-3.5 w-3.5" /> Speak</span> },
                { value: "text", label: <span className="flex items-center gap-1.5"><Keyboard className="h-3.5 w-3.5" /> Type</span> },
              ]}
            />
            {!canSpeak && (
              <p className="text-xs text-faint">
                Speaking needs a Deepgram key — <a href="/keys" className="text-paper-dim underline underline-offset-4">add one</a>.
              </p>
            )}
            <Toggle
              checked={config.voiceOut}
              disabled={!canHear}
              onChange={(v) => set("voiceOut", v)}
              icon={<Volume2 className="h-4 w-4" />}
              label="Interviewer speaks out loud"
              description={canHear ? "Off = captions only (quiet places)." : "Needs an ElevenLabs key — captions only for now."}
            />
            <Toggle checked={config.camera} onChange={(v) => set("camera", v)} icon={<Camera className="h-4 w-4" />} label="Camera" description="Eye contact & presence feedback. Analysed on your device." />
            <Toggle checked={config.coach} onChange={(v) => set("coach", v)} icon={<Lightbulb className="h-4 w-4" />} label="Private hints" description="Ask your coach for a nudge mid-answer." />
            <label className="flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-mute">
                <Languages className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm font-medium">Language</span>
              <select
                value={config.language}
                onChange={(e) => set("language", e.target.value as InterviewLanguage)}
                className="h-9 rounded-xl border border-white/10 bg-ink-800 px-3 text-[13px] text-paper outline-none"
              >
                {(Object.keys(LANGUAGE_LABELS) as InterviewLanguage[]).map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_LABELS[l]}
                  </option>
                ))}
              </select>
            </label>
          </Card>
        </div>
      </div>

      {/* sticky launcher */}
      <div className="fixed inset-x-3 bottom-20 z-20 lg:bottom-6 lg:left-[17rem] lg:right-6">
        <div className="mx-auto flex max-w-5xl items-center gap-4 rounded-2xl border border-white/10 bg-ink-800/95 px-4 py-3 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {FORMAT_META[config.format].label}
              <span className="text-mute"> · {config.duration} min · {config.persona === "silent" ? "poker-face" : config.persona} · {config.difficulty}</span>
            </p>
            <p className="truncate text-xs text-faint">
              {!role.trim()
                ? "Add a role to begin."
                : needsNotes
                  ? "Describe your scenario to begin."
                  : overBudget
                    ? `You have ${Math.floor(minutesLeft ?? 0)} minutes left this month — we'll keep it short.`
                    : `${role}${company ? ` at ${company}` : ""}${config.inputMode === "text" ? " · typed answers" : ""}`}
            </p>
          </div>
          <Button variant="glow" size="lg" disabled={!canStart} loading={starting} onClick={start}>
            Enter the room <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.05] text-paper-dim">{icon}</span>
      <h2 className="text-[15px] font-semibold">{title}</h2>
    </div>
  );
}
