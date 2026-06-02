"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { formatClock } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface SessionTimerProps {
  durationMinutes: number;
  running: boolean;
  onElapsed?: () => void;
  className?: string;
}

/** A discreet call-style timer that counts up toward the target duration. */
export function SessionTimer({
  durationMinutes,
  running,
  onElapsed,
  className,
}: SessionTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  const firedRef = useRef(false);
  const target = durationMinutes * 60;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (running && !firedRef.current && elapsed >= target) {
      firedRef.current = true;
      onElapsed?.();
    }
  }, [elapsed, target, running, onElapsed]);

  return (
    <div className={cn("flex items-center gap-2 text-sm tabular-nums", className)}>
      <Clock className="h-4 w-4 text-cream/40" />
      <span className="font-medium text-cream/80">{formatClock(elapsed)}</span>
      <span className="text-cream/30">/ {formatClock(target)}</span>
    </div>
  );
}
