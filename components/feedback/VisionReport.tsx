"use client";

import { motion } from "framer-motion";
import { Eye, User, Sparkles } from "lucide-react";
import type { VisionReport as VisionReportType } from "@/types/interview";
import { EASE } from "@/components/ui/Reveal";

export function VisionReport({ report }: { report: VisionReportType }) {
  const m = report.liveMetrics;
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        {/* Eye contact gauge */}
        <div className="flex flex-col items-center justify-center rounded-card border border-line bg-paper p-6">
          <EyeContactGauge score={report.eyeContactScore} />
          <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
            <Eye className="h-4 w-4" /> Eye contact
          </p>
        </div>

        {/* Notes */}
        <div className="space-y-5">
          <Block icon={User} title="Body language">
            {report.bodyLanguageSummary}
          </Block>
          <Block icon={Sparkles} title="Presentation">
            {report.presentationNotes}
          </Block>
        </div>
      </div>

      {/* Live tracking metrics (measured on-device, every frame) */}
      {m && (
        <div className="rounded-card border border-line bg-paper p-5">
          <p className="mb-4 flex items-center gap-2 text-sm font-medium">
            <Eye className="h-4 w-4 text-accent" /> Live tracking
            <span className="text-xs font-normal text-muted">· measured on-device</span>
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Eye contact" value={`${m.eyeContactPct}%`} />
            <Stat label="Engagement" value={`${m.engagement}/100`} />
            <Stat label="Blink rate" value={`${m.blinksPerMin}/min`} />
            <Stat label="Steadiness" value={`${m.headSteadiness}/100`} />
            <Stat label="Smiling" value={`${m.smilePct}%`} />
            <Stat label="On screen" value={`${m.presentPct}%`} />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="display text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}

function EyeContactGauge({ score }: { score: number }) {
  const size = 132;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E5E3" strokeWidth={stroke} />
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
          whileInView={{ strokeDashoffset: c * (1 - pct) }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="display text-3xl font-semibold">{Math.round(score)}</span>
      </div>
    </div>
  );
}

function Block({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Eye;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-paper p-5">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-ink-soft" /> {title}
      </p>
      <p className="text-sm leading-relaxed text-ink-soft">{children}</p>
    </div>
  );
}
