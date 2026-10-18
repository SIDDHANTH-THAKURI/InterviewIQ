"use client";

import Link from "next/link";
import { ArrowUpRight, CircleDashed } from "lucide-react";
import type { SessionRecord } from "@/lib/client/db";
import { cn, timeAgo } from "@/lib/cn";
import { FORMAT_META } from "@/types/interview";

export function SessionRow({ s }: { s: SessionRecord }) {
  const score = s.status === "complete" ? s.feedback?.overallScore : undefined;
  const href = s.status === "ready" || s.status === "live" ? `/interview/${s.id}` : `/report/${s.id}`;
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border hairline bg-white/[0.02] px-4 py-3.5 transition hover:border-white/15 hover:bg-white/[0.04]"
    >
      <span
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-xl font-semibold tabular-nums",
          score == null ? "bg-white/[0.05] text-mute" : score >= 75 ? "bg-good/12 text-good" : score >= 60 ? "bg-gold/12 text-gold" : "bg-ember/12 text-ember-soft"
        )}
      >
        {score ?? <CircleDashed className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-medium">
          {s.context.role}
          {s.context.company ? <span className="text-mute"> · {s.context.company}</span> : null}
        </span>
        <span className="block truncate text-xs text-mute">
          {FORMAT_META[s.config.format].label} · {timeAgo(s.createdAt)}
          {s.status === "unscored" ? " · not scored" : s.status === "ready" || s.status === "live" ? " · not finished" : ""}
        </span>
      </span>
      <ArrowUpRight className="h-4 w-4 text-faint transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-paper" />
    </Link>
  );
}
