"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TranscriptEntry {
  speaker: string;
  text: string;
  isYou: boolean;
}

interface LiveTranscriptProps {
  interviewerName?: string;
  interviewerLine?: string;
  candidateFinal?: string;
  candidateInterim?: string;
  thinking?: boolean;
  className?: string;
  entries?: TranscriptEntry[];
}

export function LiveTranscript({
  interviewerName = "Interviewer",
  interviewerLine,
  candidateFinal,
  candidateInterim,
  thinking,
  className,
  entries,
}: LiveTranscriptProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [interviewerLine, candidateFinal, candidateInterim, thinking, entries]);

  /* ── Panel mode: scrollable log of named entries ── */
  if (entries !== undefined) {
    return (
      <div className={cn("flex flex-col gap-4 overflow-y-auto pr-1", className)}>
        {entries.map((entry, i) => (
          <div key={i}>
            <p className={cn(
              "mb-1 text-[11px] font-medium uppercase tracking-[0.18em]",
              entry.isYou ? "text-cream/40" : "text-accent/80"
            )}>
              {entry.speaker}
            </p>
            <p className={cn(
              "text-[15px] leading-relaxed",
              entry.isYou ? "text-cream/70" : "text-cream/90"
            )}>
              {entry.text}
            </p>
          </div>
        ))}

        {thinking && <ThinkingDots />}

        {candidateInterim && (
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-cream/40">You</p>
            <p className="text-[15px] leading-relaxed italic text-cream/40">{candidateInterim}</p>
          </div>
        )}

        <div ref={endRef} />
      </div>
    );
  }

  /* ── Standard mode: single current exchange ── */
  const hasCandidate = !!(candidateFinal || candidateInterim);

  return (
    <div className={cn("flex flex-col gap-5 overflow-y-auto pr-1", className)}>
      {interviewerLine && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-accent/80">
            {interviewerName}
          </p>
          <p className="text-[15px] leading-relaxed text-cream/90">{interviewerLine}</p>
        </div>
      )}

      {thinking && !interviewerLine && <ThinkingDots />}

      {hasCandidate && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-cream/40">
            You
          </p>
          <p className="text-[15px] leading-relaxed text-cream/70">
            {candidateFinal}
            {candidateInterim && (
              <span className="text-cream/40"> {candidateInterim}</span>
            )}
          </p>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-cream/40"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </div>
  );
}
