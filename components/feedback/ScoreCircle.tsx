"use client";

import { motion } from "framer-motion";
import { EASE } from "@/components/ui/Reveal";

interface ScoreCircleProps {
  score: number;
  grade: string;
  size?: number;
  stroke?: number;
}

/** Animated circular score with the grade displayed in the center. */
export function ScoreCircle({ score, grade, size = 240, stroke = 14 }: ScoreCircleProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#E5E5E3"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1.4, ease: EASE, delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="display text-6xl font-semibold leading-none"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.5 }}
        >
          {grade}
        </motion.span>
        <motion.span
          className="mt-2 text-sm text-muted"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          {Math.round(score)}<span className="text-muted/60">/100</span>
        </motion.span>
      </div>
    </div>
  );
}
