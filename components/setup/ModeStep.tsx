"use client";

import { motion } from "framer-motion";
import { FileText, File, HelpCircle, Pencil } from "lucide-react";
import { useInterviewStore } from "@/store/interviewStore";
import type { InterviewMode } from "@/types/interview";
import { cn } from "@/lib/utils";

const MODES: {
  value: InterviewMode;
  icon: typeof FileText;
  label: string;
  caption: string;
  needs: string;
}[] = [
  {
    value: "standard",
    icon: FileText,
    label: "Full interview",
    caption: "You bring your resume, cover letter and the job description. The AI reads everything before it says a word.",
    needs: "Resume + Job description",
  },
  {
    value: "resume-only",
    icon: File,
    label: "Resume & role",
    caption: "Just drop your resume and tell it the role. It infers the rest — faster setup, still personalised.",
    needs: "Resume + Role name",
  },
  {
    value: "blind",
    icon: HelpCircle,
    label: "Blind / mystery",
    caption: "Walk in with nothing. The interviewer discovers who you are through conversation. No prep required.",
    needs: "Nothing — just show up",
  },
  {
    value: "custom",
    icon: Pencil,
    label: "Custom",
    caption: "Describe exactly the interview you want — role, company, tone, focus. You write the brief, it runs the room.",
    needs: "Your prompt",
  },
];

export function ModeStep() {
  const config = useInterviewStore((s) => s.config);
  const setConfig = useInterviewStore((s) => s.setConfig);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {MODES.map((m, i) => {
        const active = config.mode === m.value;
        return (
          <motion.button
            key={m.value}
            type="button"
            onClick={() => setConfig({ mode: m.value })}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: i * 0.07 }}
            className={cn(
              "group relative flex flex-col items-start gap-3 rounded-card border p-6 text-left transition-all duration-200",
              active
                ? "border-ink bg-ink text-cream shadow-lift"
                : "border-line bg-paper hover:border-ink/30 hover:shadow-soft"
            )}
          >
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
              active ? "border-cream/25 bg-cream/10" : "border-line bg-cream"
            )}>
              <m.icon className={cn("h-5 w-5", active ? "text-cream" : "text-ink-soft")} />
            </div>
            <div>
              <p className={cn("font-semibold", active ? "text-cream" : "text-ink")}>{m.label}</p>
              <p className={cn("mt-1 text-sm leading-relaxed", active ? "text-cream/70" : "text-muted")}>
                {m.caption}
              </p>
            </div>
            <div className={cn(
              "mt-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
              active ? "bg-cream/15 text-cream/80" : "bg-line text-muted"
            )}>
              {m.needs}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
