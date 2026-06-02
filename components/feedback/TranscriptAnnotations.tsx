"use client";

import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, MinusCircle } from "lucide-react";
import type { AnswerAnnotation, AnswerQuality } from "@/types/interview";
import { EASE } from "@/components/ui/Reveal";
import { cn } from "@/lib/utils";

const QUALITY: Record<
  AnswerQuality,
  { label: string; icon: typeof CheckCircle2; dot: string; chip: string }
> = {
  strong: {
    label: "Strong",
    icon: CheckCircle2,
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  weak: {
    label: "Weak",
    icon: AlertCircle,
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
  },
  missed: {
    label: "Missed",
    icon: MinusCircle,
    dot: "bg-red-500",
    chip: "bg-red-50 text-red-700 border-red-200",
  },
};

export function TranscriptAnnotations({
  annotations,
}: {
  annotations: AnswerAnnotation[];
}) {
  if (!annotations.length) {
    return <p className="text-sm text-muted">No answers were recorded for this session.</p>;
  }

  return (
    <div className="space-y-4">
      {annotations.map((a, i) => {
        const q = QUALITY[a.quality] ?? QUALITY.weak;
        const Icon = q.icon;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.5, ease: EASE, delay: i * 0.05 }}
            className="relative overflow-hidden rounded-card border border-line bg-paper p-5 pl-6"
          >
            <span className={cn("absolute inset-y-0 left-0 w-1", q.dot)} />
            <div className="flex items-start justify-between gap-4">
              <p className="font-medium leading-snug text-ink">{a.question}</p>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                  q.chip
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {q.label}
              </span>
            </div>
            {a.answer && (
              <p className="mt-2 text-sm italic leading-relaxed text-muted">
                “{a.answer}”
              </p>
            )}
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{a.annotation}</p>
          </motion.div>
        );
      })}
    </div>
  );
}
