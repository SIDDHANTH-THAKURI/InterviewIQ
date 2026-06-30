"use client";

import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { useInterviewStore } from "@/store/interviewStore";
import {
  type ClaudeModel,
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

const MODELS: Opt<ClaudeModel>[] = [
  { value: "haiku", label: "Haiku 4.5" },
  { value: "sonnet", label: "Sonnet 4.6" },
  { value: "opus", label: "Opus 4.8" },
];

const MODEL_DESC: Record<ClaudeModel, string> = {
  haiku: "Fastest and cheapest. Good for quick practice runs.",
  sonnet: "Best balance of speed, quality and cost. Recommended.",
  opus: "Highest quality. Slower responses, uses more of your credits.",
};

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

      <Group label="AI model" caption={MODEL_DESC[config.model ?? "sonnet"]}>
        <Chips options={MODELS} selected={config.model ?? "sonnet"} onSelect={(model) => setConfig({ model })} />
      </Group>

      <Group label="Format">
        <PanelToggle enabled={config.panelMode ?? false} onToggle={(v) => setConfig({ panelMode: v })} />
      </Group>
    </div>
  );
}

function PanelToggle({ enabled, onToggle }: { enabled: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        className={cn(
          "group flex items-start gap-4 rounded-2xl border p-5 text-left transition-all duration-200",
          enabled
            ? "border-ink bg-ink text-cream"
            : "border-line bg-paper text-ink hover:border-ink/40"
        )}
      >
        <div className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
          enabled ? "border-cream/30 bg-cream/10" : "border-line bg-cream"
        )}>
          <Users className={cn("h-4 w-4", enabled ? "text-cream" : "text-ink")} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("font-semibold", enabled ? "text-cream" : "text-ink")}>
            Panel interview
            {enabled && <span className="ml-2 text-xs font-medium opacity-60">ON</span>}
          </p>
          <p className={cn("mt-1 text-sm leading-relaxed", enabled ? "text-cream/60" : "text-muted")}>
            Two interviewers conduct your session together — naturally alternating, building on each other, and keeping you on your toes.
          </p>
        </div>
        <div className={cn(
          "mt-1 h-4 w-8 shrink-0 rounded-full transition-colors duration-200",
          enabled ? "bg-accent" : "bg-line"
        )}>
          <motion.div
            className="h-4 w-4 rounded-full bg-white shadow-sm"
            animate={{ x: enabled ? 16 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        </div>
      </button>
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
