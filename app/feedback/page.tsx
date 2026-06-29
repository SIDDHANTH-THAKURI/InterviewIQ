"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Download, RotateCcw, ArrowUpRight, Info, Loader2 } from "lucide-react";
import { useInterviewStore } from "@/store/interviewStore";
import { loadFeedback } from "@/lib/supabase";
import { saveToHistory } from "@/lib/persistence";
import { SAMPLE_FEEDBACK } from "@/lib/sampleFeedback";
import { downloadFeedbackPdf } from "@/lib/pdfReport";
import { Reveal, EASE } from "@/components/ui/Reveal";
import { ScoreCircle } from "@/components/feedback/ScoreCircle";
import { RadarChart } from "@/components/feedback/RadarChart";
import { TranscriptAnnotations } from "@/components/feedback/TranscriptAnnotations";
import { VisionReport } from "@/components/feedback/VisionReport";
import type { FeedbackDimensions, InterviewFeedback } from "@/types/interview";

const DIM_LABELS: Record<keyof FeedbackDimensions, string> = {
  communication: "Communication",
  technicalDepth: "Technical depth",
  confidence: "Confidence",
  relevance: "Relevance",
  structure: "Structure",
};

export default function FeedbackPage() {
  const router = useRouter();
  const storeFeedback = useInterviewStore((s) => s.feedback);
  const sessionId = useInterviewStore((s) => s.sessionId);
  const config = useInterviewStore((s) => s.config);
  const reset = useInterviewStore((s) => s.reset);

  const [feedback, setFeedback] = useState<InterviewFeedback | null>(storeFeedback);
  const [isSample, setIsSample] = useState(false);
  const [loading, setLoading] = useState(!storeFeedback);

  useEffect(() => {
    if (storeFeedback) {
      setFeedback(storeFeedback);
      setLoading(false);
      if (sessionId) saveToHistory(sessionId, config, storeFeedback);
      return;
    }
    let active = true;
    (async () => {
      const fromDb = sessionId ? await loadFeedback(sessionId) : null;
      if (!active) return;
      if (fromDb) {
        setFeedback(fromDb);
      } else {
        setFeedback(SAMPLE_FEEDBACK);
        setIsSample(true);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [storeFeedback, sessionId]);

  const [leaving, setLeaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const startOver = () => {
    if (leaving) return;
    setLeaving(true);
    reset();
    router.push("/keys");
  };

  const handleDownload = async () => {
    if (downloading || !feedback) return;
    setDownloading(true);
    try {
      await Promise.resolve(downloadFeedbackPdf(feedback, config));
    } finally {
      // Let the spinner read as deliberate even on a fast machine.
      setTimeout(() => setDownloading(false), 600);
    }
  };

  if (loading || !feedback) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream">
        <motion.div
          className="h-10 w-10 rounded-full border-2 border-line border-t-accent"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
        />
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-cream grain pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-line bg-cream/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-10">
          <Link href="/" className="display text-xl font-semibold tracking-tight">
            Interview<span style={{ color: "var(--accent-ink)" }}>IQ</span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="btn-ghost text-sm disabled:opacity-70"
            >
              {downloading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Preparing…</>
              ) : (
                <><Download className="h-4 w-4" /> Download PDF</>
              )}
            </button>
            <button onClick={startOver} disabled={leaving} className="btn-primary text-sm disabled:opacity-80">
              {leaving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</>
              ) : (
                <><RotateCcw className="h-4 w-4" /> New interview</>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        {isSample && (
          <Reveal onView={false} className="mt-6">
            <div className="flex items-center gap-2 rounded-card border border-line bg-paper px-4 py-3 text-sm text-muted">
              <Info className="h-4 w-4 text-accent" />
              This is a sample report. Complete an interview to see your own.
            </div>
          </Reveal>
        )}

        {/* Title */}
        <section className="pt-12 sm:pt-16">
          <Reveal onView={false}>
            <p className="eyebrow text-muted">Your results</p>
            <h1 className="display mt-3 text-5xl font-semibold sm:text-6xl">
              How you did.
            </h1>
          </Reveal>
        </section>

        {/* Overall + summary */}
        <section className="mt-12 grid items-center gap-12 rounded-card border border-line bg-paper p-8 sm:p-12 md:grid-cols-[auto_1fr]">
          <Reveal onView={false} delay={0.1} className="flex justify-center">
            <ScoreCircle score={feedback.overallScore} grade={feedback.grade} />
          </Reveal>
          <Reveal onView={false} delay={0.2}>
            <p className="eyebrow text-muted">The verdict</p>
            <p className="mt-3 text-pretty text-xl leading-relaxed text-ink sm:text-2xl">
              {feedback.overallSummary}
            </p>
          </Reveal>
        </section>

        {/* Dimensions */}
        <section className="mt-20">
          <Reveal>
            <p className="eyebrow text-muted">Dimension breakdown</p>
            <h2 className="display mt-3 text-3xl font-semibold sm:text-4xl">
              Where the points went.
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-8 md:grid-cols-2">
            <Reveal className="rounded-card border border-line bg-paper p-6">
              <RadarChart dimensions={feedback.dimensions} />
            </Reveal>
            <Reveal delay={0.1} className="flex flex-col justify-center gap-5">
              <DimensionBars dimensions={feedback.dimensions} />
            </Reveal>
          </div>
        </section>

        {/* What to fix */}
        <section className="mt-20">
          <Reveal>
            <p className="eyebrow text-muted">What to fix</p>
            <h2 className="display mt-3 text-3xl font-semibold sm:text-4xl">
              Three things, in order.
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3">
            {feedback.topThreeImprovements.map((t, i) => (
              <Reveal key={i} delay={i * 0.1} className="bg-paper p-8">
                <div className="display text-4xl font-semibold text-accent">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <p className="mt-4 leading-relaxed text-ink-soft">{t}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Strengths */}
        {feedback.strengths.length > 0 && (
          <section className="mt-20">
            <Reveal>
              <p className="eyebrow text-muted">What worked</p>
              <h2 className="display mt-3 text-3xl font-semibold sm:text-4xl">Your strengths.</h2>
            </Reveal>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {feedback.strengths.map((s, i) => (
                <Reveal
                  key={i}
                  delay={i * 0.08}
                  className="rounded-card border border-line bg-paper p-6 text-lg leading-relaxed text-ink"
                >
                  {s}
                </Reveal>
              ))}
            </div>
          </section>
        )}

        {/* Vision report */}
        <section className="mt-20">
          <Reveal>
            <p className="eyebrow text-muted">Vision report</p>
            <h2 className="display mt-3 text-3xl font-semibold sm:text-4xl">
              What the room saw.
            </h2>
          </Reveal>
          <div className="mt-10">
            <Reveal>
              <VisionReport report={feedback.visionReport} />
            </Reveal>
          </div>
        </section>

        {/* Moment by moment */}
        <section className="mt-20">
          <Reveal>
            <p className="eyebrow text-muted">Moment by moment</p>
            <h2 className="display mt-3 text-3xl font-semibold sm:text-4xl">
              Answer by answer.
            </h2>
          </Reveal>
          <div className="mt-10">
            <TranscriptAnnotations annotations={feedback.answerAnnotations} />
          </div>
        </section>

        {/* CTA */}
        <section className="mt-20">
          <Reveal className="flex flex-col items-start justify-between gap-6 rounded-card border border-line bg-ink p-10 text-cream sm:flex-row sm:items-center">
            <div>
              <h3 className="display text-3xl font-semibold">Run it back.</h3>
              <p className="mt-2 text-cream/70">Same documents, sharper answers.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => downloadFeedbackPdf(feedback, config)}
                className="inline-flex items-center gap-2 rounded-full border border-cream/25 px-6 py-3 text-sm text-cream/90 hover:bg-cream/10"
              >
                <Download className="h-4 w-4" /> Download report
              </button>
              <button
                onClick={startOver}
                className="inline-flex items-center gap-2 rounded-full bg-cream px-6 py-3 text-sm font-medium text-ink transition-transform hover:-translate-y-0.5"
              >
                New interview <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          </Reveal>
        </section>
      </div>
    </main>
  );
}

function DimensionBars({ dimensions }: { dimensions: FeedbackDimensions }) {
  const entries = Object.entries(dimensions) as [keyof FeedbackDimensions, number][];
  return (
    <div className="space-y-5">
      {entries.map(([key, value], i) => (
        <div key={key}>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm font-medium text-ink">{DIM_LABELS[key]}</span>
            <span className="text-sm tabular-nums text-muted">{value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={{ width: 0 }}
              whileInView={{ width: `${value}%` }}
              viewport={{ once: true }}
              transition={{ duration: 1, ease: EASE, delay: 0.1 + i * 0.08 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
