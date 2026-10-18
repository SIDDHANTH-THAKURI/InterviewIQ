"use client";

import { useEffect, useState } from "react";
import { animate, motion, useInView } from "motion/react";
import { useRef } from "react";
import { cn } from "@/lib/cn";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Count-up number that starts when scrolled into view. */
export function CountUp({ value, className, duration = 1.6 }: { value: number; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, value, { duration, ease: EASE, onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [inView, value, duration]);
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {n}
    </span>
  );
}

/** The single headline score, drawn as a ring with a soft glow. */
export function ScoreRing({ value, size = 220 }: { value: number; size?: number }) {
  const stroke = 10;
  const r = (size - stroke * 2) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute inset-[18%] rounded-full bg-ember/20 blur-3xl" />
      <svg viewBox={`0 0 ${size} ${size}`} className="relative h-full w-full -rotate-90" role="img" aria-label={`Score ${value} out of 100`}>
        <defs>
          <linearGradient id="ring-grad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffd6a5" />
            <stop offset="55%" stopColor="#ff8a4c" />
            <stop offset="100%" stopColor="#ff5c5c" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,138,76,0.12)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ring-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value / 100) }}
          transition={{ duration: 1.8, ease: EASE, delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <CountUp value={value} className="display text-[clamp(4rem,9vw,5.5rem)] leading-none" />
        <span className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-mute">out of 100</span>
      </div>
    </div>
  );
}

/** Labelled horizontal meter, 0–100, with an optional delta vs. a baseline. */
export function Meter({
  label,
  value,
  baseline,
  delay = 0,
}: {
  label: string;
  value: number;
  baseline?: number | null;
  delay?: number;
}) {
  const delta = baseline != null ? value - baseline : null;
  return (
    <div className="group">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm text-paper-dim">{label}</span>
        <span className="flex items-baseline gap-2">
          {delta !== null && delta !== 0 && (
            <span className={cn("text-xs font-medium", delta > 0 ? "text-good" : "text-bad")}>
              {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}
            </span>
          )}
          <span className="text-base font-semibold tabular-nums">{value}</span>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-ember/12">
        {baseline != null && (
          <span
            className="absolute -top-1 h-4 w-[2px] rounded-full bg-paper/40"
            style={{ left: `calc(${baseline}% - 1px)` }}
            title={`Your recent average: ${baseline}`}
          />
        )}
        <motion.div
          className="h-full rounded-full bg-ember"
          initial={{ width: 0 }}
          whileInView={{ width: `${value}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1.3, ease: EASE, delay }}
        />
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  unit,
  note,
  tone,
}: {
  label: string;
  value: string | number;
  unit?: string;
  note?: string;
  tone?: "good" | "warn" | "neutral";
}) {
  return (
    <div className="rounded-2xl border hairline bg-white/[0.02] p-4">
      <p className="text-xs text-mute">{label}</p>
      <p className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
        {unit && <span className="text-sm text-mute">{unit}</span>}
      </p>
      {note && (
        <p className={cn("mt-1 text-xs", tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : "text-faint")}>{note}</p>
      )}
    </div>
  );
}

/**
 * Score trend: one series, a 2px line with markers and a hover crosshair +
 * tooltip. Single series, so the title names it and there's no legend.
 */
export function TrendChart({ points, height = 160 }: { points: { label: string; value: number }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 600;
  const pad = { l: 28, r: 12, t: 12, b: 24 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / 100) * ih;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${d} L${x(points.length - 1)},${pad.t + ih} L${x(0)},${pad.t + ih} Z`;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Score trend: ${points.map((p) => p.value).join(", ")}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * w;
          let best = 0;
          points.forEach((_, i) => {
            if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
          });
          setHover(best);
        }}
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ff8a4c" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#ff8a4c" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={w - pad.r} y1={y(g)} y2={y(g)} stroke="rgba(255,255,255,0.06)" />
            <text x={pad.l - 8} y={y(g) + 4} textAnchor="end" className="fill-faint text-[10px]">
              {g}
            </text>
          </g>
        ))}
        {points.length > 1 && <path d={area} fill="url(#trend-fill)" />}
        <motion.path
          d={d}
          fill="none"
          stroke="#ff8a4c"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: EASE }}
        />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="rgba(255,255,255,0.18)" />}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.value)}
            r={hover === i ? 5.5 : 4}
            fill="#ff8a4c"
            stroke="#0a0a0d"
            strokeWidth={2}
          />
        ))}
        {points.length > 0 && (
          <text x={x(points.length - 1)} y={y(points[points.length - 1].value) - 10} textAnchor="end" className="fill-paper text-[11px] font-semibold">
            {points[points.length - 1].value}
          </text>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-white/10 bg-ink-700 px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: `${(x(hover) / w) * 100}%` }}
        >
          <span className="text-mute">{points[hover].label}</span> · <span className="font-semibold">{points[hover].value}</span>
        </div>
      )}
    </div>
  );
}
