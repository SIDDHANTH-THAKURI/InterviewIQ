"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { AuraOrb } from "@/components/aura/AuraOrb";
import { ResumeDrop } from "@/components/ResumeDrop";
import { Badge, Button, Eyebrow, Field, Input, Logo } from "@/components/ui/kit";
import { api } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { cn } from "@/lib/cn";
import { LANGUAGE_LABELS, type CandidateProfile, type InterviewLanguage } from "@/types/interview";
import type { ResumeInsights } from "@/lib/ai/prep";

const LEVELS: { value: CandidateProfile["experienceLevel"]; label: string }[] = [
  { value: "student", label: "Student / intern" },
  { value: "entry", label: "Early career (0–2 yrs)" },
  { value: "mid", label: "Mid-level (3–6 yrs)" },
  { value: "senior", label: "Senior (7+ yrs)" },
  { value: "lead", label: "Lead / manager" },
  { value: "career-change", label: "Changing careers" },
];

const GOALS = [
  "Land my first job",
  "Get back into work",
  "Switch careers",
  "Level up / get promoted",
  "Beat interview nerves",
  "Practice speaking in English",
  "Negotiate a better offer",
  "Prepare for a specific interview",
];

const NERVES = [
  { v: 1, label: "Calm", sub: "I enjoy them" },
  { v: 2, label: "Mostly fine", sub: "A few butterflies" },
  { v: 3, label: "Nervous", sub: "I get tense" },
  { v: 4, label: "Very nervous", sub: "I freeze sometimes" },
  { v: 5, label: "Dread them", sub: "I avoid them" },
];

const EASE = [0.16, 1, 0.3, 1] as const;

export default function Onboarding() {
  const router = useRouter();
  const { updateProfile, access } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(access?.name && access.role !== "admin" ? access.name.split(" ")[0] : "");
  const [resume, setResume] = useState({ text: "", fileName: undefined as string | undefined });
  const [insights, setInsights] = useState<ResumeInsights | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [role, setRole] = useState("");
  const [level, setLevel] = useState<CandidateProfile["experienceLevel"]>("mid");
  const [nerves, setNerves] = useState(3);
  const [goals, setGoals] = useState<string[]>([]);
  const [language, setLanguage] = useState<InterviewLanguage>("en");
  const [saving, setSaving] = useState(false);

  const analyze = async (text: string) => {
    if (text.trim().length < 80) return;
    setAnalyzing(true);
    try {
      const { insights } = await api<{ insights: ResumeInsights }>("/api/profile/analyze", {
        method: "POST",
        body: JSON.stringify({ resumeText: text }),
      });
      setInsights(insights);
      if (!role) setRole(insights.suggestedRole);
      setLevel(insights.experienceLevel);
      if (!name && insights.name) setName(insights.name.split(" ")[0]);
    } catch {
      /* optional nicety — the user can type everything */
    } finally {
      setAnalyzing(false);
    }
  };

  const finish = async (thenPractice: boolean) => {
    setSaving(true);
    await updateProfile({
      name: name.trim(),
      headline: insights?.headline ?? "",
      summary: insights?.summary,
      skills: insights?.skills,
      targetRole: role.trim(),
      experienceLevel: level,
      resumeText: resume.text,
      resumeFileName: resume.fileName,
      nerves,
      goals,
      preferredLanguage: language,
    });
    router.replace(thenPractice ? "/practice?first=1" : "/home");
  };

  const steps = [
    {
      title: (
        <>
          First, what should we <span className="italic text-ember-grad">call you?</span>
        </>
      ),
      body: "Your interviewer will greet you by name.",
      valid: name.trim().length > 0,
      content: (
        <Input
          autoFocus
          placeholder="Your first name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && setStep(1)}
          className="h-14 text-lg"
        />
      ),
    },
    {
      title: (
        <>
          Add your <span className="italic text-ember-grad">resume</span>
        </>
      ),
      body: "So questions are about your real experience. Optional — you can add it later.",
      valid: true,
      content: (
        <div className="space-y-4">
          <ResumeDrop
            text={resume.text}
            fileName={resume.fileName}
            onChange={(text, fileName) => {
              setResume({ text, fileName });
              if (text && fileName) void analyze(text);
            }}
          />
          <AnimatePresence>
            {(analyzing || insights) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="overflow-hidden rounded-2xl border border-iris/20 bg-iris/[0.05] p-4"
              >
                {analyzing ? (
                  <p className="shimmer-text flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-iris" /> Getting to know your background…
                  </p>
                ) : (
                  insights && (
                    <div>
                      <p className="flex items-center gap-2 text-sm font-medium text-iris">
                        <Sparkles className="h-4 w-4" /> {insights.headline}
                      </p>
                      <p className="mt-1.5 text-sm text-paper-dim">{insights.summary}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {insights.skills.slice(0, 8).map((s) => (
                          <Badge key={s}>{s}</Badge>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ),
    },
    {
      title: (
        <>
          What are you <span className="italic text-ember-grad">aiming for?</span>
        </>
      ),
      body: "You can practice for anything, any time — this is just your default.",
      valid: role.trim().length > 1,
      content: (
        <div className="space-y-5">
          <Field label="Target role">
            <Input placeholder="e.g. Data Analyst, Nurse, Product Designer" value={role} onChange={(e) => setRole(e.target.value)} />
          </Field>
          <Field label="Where you are now">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {LEVELS.map((l) => (
                <Choice key={l.value} active={level === l.value} onClick={() => setLevel(l.value)}>
                  {l.label}
                </Choice>
              ))}
            </div>
          </Field>
          <Field label="Interview language">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as InterviewLanguage)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-ink-800 px-4 text-[15px] text-paper outline-none focus:border-ember/50"
            >
              {(Object.keys(LANGUAGE_LABELS) as InterviewLanguage[]).map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABELS[l]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ),
    },
    {
      title: (
        <>
          How do interviews <span className="italic text-ember-grad">feel</span> for you?
        </>
      ),
      body: "Honest answers help us pace things. Nobody sees this but you.",
      valid: true,
      content: (
        <div className="space-y-6">
          <div className="grid grid-cols-5 gap-2">
            {NERVES.map((n) => (
              <button
                key={n.v}
                type="button"
                onClick={() => setNerves(n.v)}
                className={cn(
                  "rounded-2xl border px-2 py-3.5 text-center transition",
                  nerves === n.v ? "border-tide/50 bg-tide/10" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
                )}
              >
                <span className={cn("mx-auto mb-2 block h-2 w-2 rounded-full", nerves === n.v ? "bg-tide" : "bg-white/20")} />
                <span className="block text-[13px] font-medium">{n.label}</span>
                <span className="mt-0.5 hidden text-[11px] text-mute sm:block">{n.sub}</span>
              </button>
            ))}
          </div>
          <Field label="What brings you here? (pick any)">
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => {
                const on = goals.includes(g);
                return (
                  <Choice
                    key={g}
                    active={on}
                    pill
                    onClick={() => setGoals((gs) => (on ? gs.filter((x) => x !== g) : [...gs, g]))}
                  >
                    {on && <Check className="h-3.5 w-3.5" />} {g}
                  </Choice>
                );
              })}
            </div>
          </Field>
        </div>
      ),
    },
  ];

  const done = step >= steps.length;
  const s = steps[Math.min(step, steps.length - 1)];

  return (
    <main className="relative grid min-h-dvh lg:grid-cols-[1fr_1.15fr]">
      <section className="relative hidden overflow-hidden border-r hairline lg:block">
        <div className="absolute inset-0 dot-grid opacity-40" />
        <div className="absolute inset-0 grid place-items-center">
          <div className="aspect-square w-[78%]">
            <AuraOrb mood={done ? "speaking" : step === 3 ? "listening" : "idle"} energy={0.25 + step * 0.06} scale={0.95} interactive className="h-full w-full" />
          </div>
        </div>
        <div className="absolute left-10 top-10">
          <Logo />
        </div>
        <p className="absolute bottom-10 left-10 right-10 max-w-sm text-sm leading-relaxed text-mute">
          Everything you share here is stored only in this browser. You can export or delete it any time from your profile.
        </p>
      </section>

      <section className="flex flex-col px-6 py-10 sm:px-12 lg:px-16">
        <div className="flex items-center justify-between lg:justify-end">
          <Logo className="lg:hidden" />
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn("h-1.5 rounded-full transition-all duration-500", i <= step ? "w-8 bg-ember" : "w-4 bg-white/15")}
              />
            ))}
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-10">
          <AnimatePresence mode="wait">
            {!done ? (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                <Eyebrow>
                  Step {step + 1} of {steps.length}
                </Eyebrow>
                <h1 className="display mt-4 text-[clamp(2.4rem,4.6vw,3.6rem)]">{s.title}</h1>
                <p className="mt-3 text-[15px] text-mute">{s.body}</p>
                <div className="mt-8">{s.content}</div>
              </motion.div>
            ) : (
              <motion.div key="done" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
                <Eyebrow>All set</Eyebrow>
                <h1 className="display mt-4 text-[clamp(2.6rem,5vw,4rem)]">
                  Nice to meet you, <span className="italic text-ember-grad">{name.trim()}</span>.
                </h1>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-mute">
                  {nerves >= 4
                    ? "We'll start gently: a short, friendly five-minute warm-up. You can pause, ask for hints, or type instead of speaking — whatever helps."
                    : "Your first session is a short, realistic warm-up so you can feel how it works. It takes about five minutes."}
                </p>
                <div className="mt-10 flex flex-wrap gap-3">
                  <Button variant="glow" size="lg" loading={saving} onClick={() => finish(true)}>
                    Start my first session <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" size="lg" disabled={saving} onClick={() => finish(false)}>
                    Look around first
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!done && (
          <div className="mx-auto flex w-full max-w-xl items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((n) => Math.max(0, n - 1))} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <div className="flex gap-2">
              {step === 1 && !resume.text && (
                <Button variant="ghost" onClick={() => setStep(2)}>
                  Skip for now
                </Button>
              )}
              <Button disabled={!s.valid} onClick={() => setStep((n) => n + 1)}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function Choice({
  active,
  onClick,
  children,
  pill,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  pill?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 border text-[13.5px] font-medium transition",
        pill ? "rounded-full px-4 py-2" : "rounded-2xl px-3 py-3",
        active ? "border-ember/45 bg-ember/10 text-paper" : "border-white/10 bg-white/[0.02] text-paper-dim hover:bg-white/[0.05]"
      )}
    >
      {children}
    </button>
  );
}
