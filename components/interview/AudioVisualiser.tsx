"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface AudioVisualiserProps {
  /** Current input/output level, 0..1. */
  level: number;
  bars?: number;
  active?: boolean;
  className?: string;
  /** CSS color for the bars (defaults to the accent). */
  color?: string;
  /** Height of the tallest possible bar, px. */
  height?: number;
}

/**
 * A row of reactive bars. Center bars react more strongly than the edges,
 * giving an organic "voice" shape. Presentational — driven by a `level` prop.
 */
export function AudioVisualiser({
  level,
  bars = 28,
  active = true,
  className,
  color = "var(--accent)",
  height = 56,
}: AudioVisualiserProps) {
  // Static per-bar weighting: tall in the middle, short at the edges.
  const weights = useMemo(() => {
    return Array.from({ length: bars }, (_, i) => {
      const t = i / (bars - 1);
      const bell = Math.sin(t * Math.PI); // 0..1..0
      const jitter = 0.7 + 0.3 * Math.sin(i * 12.9898);
      return 0.25 + 0.75 * bell * jitter;
    });
  }, [bars]);

  const l = active ? Math.max(0, Math.min(1, level)) : 0;

  return (
    <div
      className={cn("flex items-center justify-center gap-[3px]", className)}
      style={{ height }}
      aria-hidden
    >
      {weights.map((w, i) => {
        // Square-root curve: quiet speech (l~0.1) reads as ~30% height,
        // loud speech (l~0.7) reads as ~70%. Feels alive without clipping.
        const driven = Math.pow(l * w, 0.55);
        const h = Math.max(3, (0.04 + driven * 0.96) * height);
        return (
          <span
            key={i}
            className="w-[3px] rounded-full transition-[height,opacity] duration-100 ease-out"
            style={{
              height: h,
              backgroundColor: color,
              opacity: active ? 0.5 + 0.5 * Math.min(1, l * w + 0.1) : 0.25,
            }}
          />
        );
      })}
    </div>
  );
}
