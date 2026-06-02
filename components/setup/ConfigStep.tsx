"use client";

import { motion } from "framer-motion";
import { useInterviewStore } from "@/store/interviewStore";
import {
  type Difficulty,
  type DurationMinutes,
  type InterviewMode,
  type InterviewType,
  type Personality,
} from "@/types/interview";
import { cn } from "@/lib/utils";

interface Opt<T> {
  value: T;
  label: string;
}

const MODES: { value: InterviewMode; label: string; caption: string }[] = [
  {
    value: "standard",
    label: "Full interview",
    caption: "AI uses your resume, cover letter and job description.",
  },
  {
    value: "resume-only",
    label: "Resume & role",
    caption: "Just your resume and the role name — AI fills in the rest.",
  },
  {
    value: "blind",
    label: "Blind / mystery",
    caption: "No context given. The AI discovers who you are through conversation.",
  },
  {
    value: "custom",
    label: "Custom",
    caption: "Describe exactly the interview you want.",
  },
];

const TYPES: Opt<InterviewType>[] = [
  { value: "behavioral", label: "Behavioral" },
  { value: "technical", label: "Technical" },
  { value: "mixed", label: "Mixed" },
];

const DIFFICULTIES: Opt<Difficulty>[] = [
  { value: "entry", label: "Entry" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "brutal", label: "Brutal" },
];

const DURATIONS: Opt<DurationMinutes>[] = [
  { value: 10, label: "10 min" },
  { value: 20, label: "20 min" },
  { value: 30, label: "30 min" },
];

const PERSONALITIES: Opt<Personality>[] = [
  { value: "friendly", label: "Friendly" },
  { value: "neutral", label: "Neutral" },
  { value: "tough", label: "Tough" },
  { value: "silent", label: "Silent" },
];

const DIFFICULTY_DESC: Record<Difficulty, string> = {
  entry: "Approachable questions with room to think and gentle hints.",
  mid: "Solid, role-relevant questions. Vague answers get a light push.",
  senior: "Depth, trade-offs and ownership. Hand-wavy answers get challenged.",
  brutal: "Relentless. Interruptions, specifics demanded, gaps exposed.",
};

const PERSONALITY_DESC: Record<Personality, string> = {
  friendly: "Warm and encouraging. Keeps you at ease.",
  neutral: "Professional and even-handed. Lets answers stand on their own.",
  tough: "Skeptical and demanding. Sparse praise — you earn it.",
  silent: "Minimal. Long pauses, few prompts. Sees how you handle silence.",
};

export function ConfigStep() {
  const config = useInterviewStore((s) => s.config);
  const setConfig = useInterviewStore((s) => s.setConfig);

  return (
    <div className="space-y-10">
      {/* Mode */}
      <Group label="Interview mode">
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => {
            const active = config.mode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setConfig({ mode: m.value })}
                className={cn(
                  "rounded-card border p-4 text-left transition-all duration-200",
                  active
                    ? "border-ink bg-ink text-cream shadow-soft"
                    : "border-line bg-paper text-ink hover:border-ink/40"
                )}
              >
                <p className="font-medium">{m.label}</p>
                <p className={cn("mt-1 text-sm", active ? "text-cream/70" : "text-muted")}>
                  {m.caption}
                </p>
              </button>
            );
          })}
        </div>

        {/* Custom prompt textarea */}
        {config.mode === "custom" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4"
          >
            <textarea
              value={config.customPrompt ?? ""}
              onChange={(e) => setConfig({ customPrompt: e.target.value })}
              placeholder="e.g. 'A senior product manager interview at a late-stage startup, focus on strategy, metrics and cross-functional leadership. Be skeptical.'"
              rows={4}
              className="w-full resize-y rounded-card border border-line bg-paper p-4 text-sm leading-relaxed text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
            />
          </motion.div>
        )}

        {/* Job role field for resume-only */}
        {config.mode === "resume-only" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4"
          >
            <input
              type="text"
              value={config.jobRole ?? ""}
              onChange={(e) => setConfig({ jobRole: e.target.value })}
              placeholder="Job role or title — e.g. Senior Backend Engineer"
              className="w-full rounded-card border border-line bg-paper px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
            />
          </motion.div>
        )}
      </Group>

      <Group label="Interview type">
        <Chips options={TYPES} selected={config.type} onSelect={(type) => setConfig({ type })} />
      </Group>

      <Group label="Difficulty" caption={DIFFICULTY_DESC[config.difficulty]}>
        <Chips options={DIFFICULTIES} selected={config.difficulty} onSelect={(difficulty) => setConfig({ difficulty })} />
      </Group>

      <Group label="Duration">
        <Chips options={DURATIONS} selected={config.duration} onSelect={(duration) => setConfig({ duration })} />
      </Group>

      <Group label="Interviewer personality" caption={PERSONALITY_DESC[config.personality]}>
        <Chips options={PERSONALITIES} selected={config.personality} onSelect={(personality) => setConfig({ personality })} />
      </Group>
    </div>
  );
}

function Group({ label, caption, children }: { label: string; caption?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="eyebrow text-muted">{label}</span>
      <div className="mt-3">{children}</div>
      {caption && (
        <motion.p key={caption} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }} className="mt-3 text-sm text-muted">
          {caption}
        </motion.p>
      )}
    </div>
  );
}

function Chips<T extends string | number>({ options, selected, onSelect }: {
  options: Opt<T>[]; selected: T; onSelect: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((o) => {
        const active = o.value === selected;
        return (
          <button key={String(o.value)} type="button" onClick={() => onSelect(o.value)}
            className={cn(
              "rounded-full border px-5 py-2.5 text-sm font-medium transition-all duration-200",
              active
                ? "border-ink bg-ink text-cream shadow-soft"
                : "border-line bg-paper text-ink-soft hover:border-ink/40 hover:text-ink"
            )}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
