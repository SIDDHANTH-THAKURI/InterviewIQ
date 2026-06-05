"use client";

import { motion } from "framer-motion";
import { useInterviewStore } from "@/store/interviewStore";
import {
  type Difficulty,
  type DurationMinutes,
  type InterviewType,
  type Personality,
} from "@/types/interview";
import { cn } from "@/lib/utils";

interface Opt<T> {
  value: T;
  label: string;
}

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
