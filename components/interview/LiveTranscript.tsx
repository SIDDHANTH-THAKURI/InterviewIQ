"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface LiveTranscriptProps {
  interviewerName?: string;
  interviewerLine?: string;
  candidateFinal?: string;
  candidateInterim?: string;
  thinking?: boolean;
  className?: string;
}

/**
 * The subtle, ambient transcript shown beneath the webcam pip. Deliberately
 * shows only the live exchange — the current interviewer line and the
 * candidate's words as they speak.
 */
export function LiveTranscript({
  interviewerName = "Interviewer",
  interviewerLine,
  candidateFinal,
  candidateInterim,
  thinking,
  className,
}: LiveTranscriptProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [interviewerLine, candidateFinal, candidateInterim, thinking]);

  const hasCandidate = !!(candidateFinal || candidateInterim);

  return (
    <div className={cn("flex flex-col gap-5 overflow-y-auto pr-1", className)}>
      {/* Interviewer line updates in place (no per-word re-animation) so the
          text builds up smoothly in step with the voice. */}
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
