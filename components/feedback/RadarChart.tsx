"use client";

import {
  Radar,
  RadarChart as ReRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import type { FeedbackDimensions } from "@/types/interview";

interface RadarChartProps {
  dimensions: FeedbackDimensions;
}

const LABELS: Record<keyof FeedbackDimensions, string> = {
  communication: "Communication",
  technicalDepth: "Technical depth",
  confidence: "Confidence",
  relevance: "Relevance",
  structure: "Structure",
};

export function RadarChart({ dimensions }: RadarChartProps) {
  const data = (Object.keys(LABELS) as (keyof FeedbackDimensions)[]).map((k) => ({
    subject: LABELS[k],
    value: dimensions[k],
  }));

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ReRadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#E5E5E3" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: "#6B6B66", fontSize: 12 }}
          />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            dataKey="value"
            stroke="var(--accent)"
            fill="var(--accent)"
            fillOpacity={0.22}
            strokeWidth={2}
            isAnimationActive
            animationDuration={1100}
          />
        </ReRadarChart>
      </ResponsiveContainer>
    </div>
  );
}
