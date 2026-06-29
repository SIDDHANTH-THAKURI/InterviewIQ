"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, Play } from "lucide-react";
import { useInterviewStore } from "@/store/interviewStore";
import { ModeStep } from "@/components/setup/ModeStep";
import { DocumentUpload } from "@/components/setup/DocumentUpload";
import { ConfigStep } from "@/components/setup/ConfigStep";
import { MediaCheck } from "@/components/setup/MediaCheck";
import { EASE } from "@/components/ui/Reveal";
import { unlockPlayback } from "@/lib/audioBus";
import { cn } from "@/lib/utils";
import { loadDraftConfig, loadDraftDocs, saveDraftConfig, saveDraftDocs } from "@/lib/persistence";

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -48 : 48, opacity: 0 }),
};

/** Returns the ordered list of steps for the selected mode.
 *  "blind" skips the documents step entirely; all others include it. */
function useSteps(mode: string) {
  return useMemo(() => {
    const base = [
      { id: "mode",      title: "How do you want to interview?",    caption: "Pick a format — we'll ask only what we need." },
      { id: "configure", title: "Shape the interview",              caption: "Tune the type, intensity and length." },
      { id: "camera",    title: "Camera & mic check",               caption: "Make sure you're seen and heard." },
    ];
    if (mode === "blind") return base;
    const docs =
      mode === "custom"
        ? { id: "docs", title: "Describe your interview",          caption: "Tell us what you want — we'll run it." }
        : mode === "resume-only"
          ? { id: "docs", title: "Upload your resume",             caption: "Just the resume and the role name." }
          : { id: "docs", title: "Bring your documents",           caption: "The interviewer reads all of this before you sit down." };
    return [base[0], docs, base[1], base[2]];
  }, [mode]);
}

export default function SetupPage() {
  const router = useRouter();
  const documents = useInterviewStore((s) => s.documents);
  const config = useInterviewStore((s) => s.config);
  const setConfig = useInterviewStore((s) => s.setConfig);
  const setDocuments = useInterviewStore((s) => s.setDocuments);
  const newSession = useInterviewStore((s) => s.newSession);

  const [step, setStep] = useState(0);
  const directionRef = useRef(1);
  const [mediaReady, setMediaReady] = useState(false);
  const [loading, setLoading] = useState(false);

  const steps = useSteps(config.mode);
  const currentStep = steps[step];
  const isLastStep = step === steps.length - 1;

  // Redirect to /keys if no keys saved yet
  useEffect(() => {
    import("@/lib/keys").then(({ loadKeys, keysAreSet }) => {
      if (!keysAreSet(loadKeys())) router.replace("/keys");
    });
  }, [router]);

  // Pre-fill from last session (only on first mount, before user changes anything)
  useEffect(() => {
    const draftConfig = loadDraftConfig();
    const draftDocs = loadDraftDocs();
    if (draftConfig) setConfig(draftConfig);
    if (draftDocs) setDocuments(draftDocs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalculate step index when mode changes and steps array shifts
  useEffect(() => {
    setStep(0);
  }, [config.mode]);

  const canContinue = useMemo(() => {
    const id = currentStep?.id;
    if (id === "mode") return true; // always can continue from mode selection
    if (id === "docs") {
      const mode = config.mode;
      if (mode === "resume-only") return documents.resumeText.trim().length > 0 && (config.jobRole ?? "").trim().length > 0;
      if (mode === "custom") return (config.customPrompt ?? "").trim().length > 20;
      return documents.resumeText.trim().length > 0 && documents.jobDescription.trim().length > 0;
    }
    if (id === "camera") return mediaReady;
    return true;
  }, [currentStep, documents, mediaReady, config]);

  const go = (next: number) => {
    directionRef.current = next > step ? 1 : -1;
    setStep(next);
  };

  const handleBegin = async () => {
    setLoading(true);
    saveDraftConfig(config);
    saveDraftDocs(documents);
    await unlockPlayback();
    newSession();
    router.push("/interview");
  };

  const canGoBack = step > 0;

  return (
    <main className="relative min-h-screen bg-cream grain">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="display text-xl font-semibold tracking-tight">
          Interview<span style={{ color: "var(--accent-ink)" }}>IQ</span>
        </Link>
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
      </header>

      <div className="mx-auto max-w-5xl px-6 pb-36 pt-6 sm:px-10">
        <Stepper step={step} total={steps.length} onJump={(i) => i < step && go(i)} />

        <div className="mt-10">
          <p className="eyebrow text-muted">Step {step + 1} of {steps.length}</p>
          <h1 className="display mt-3 text-4xl font-semibold sm:text-5xl">
            {currentStep?.title}
          </h1>
          <p className="mt-3 max-w-xl text-ink-soft">{currentStep?.caption}</p>
        </div>

        <div className="relative mt-10 min-h-[340px]">
          <AnimatePresence mode="wait" custom={directionRef.current}>
            <motion.div
              key={step}
              custom={directionRef.current}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.42, ease: EASE }}
            >
              {currentStep?.id === "mode"      && <ModeStep />}
              {currentStep?.id === "docs"      && <DocumentUpload />}
              {currentStep?.id === "configure" && <ConfigStep />}
              {currentStep?.id === "camera"    && <MediaCheck onReadyChange={setMediaReady} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-cream/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 sm:px-10">
          <button
            onClick={() => go(Math.max(0, step - 1))}
            disabled={!canGoBack}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors",
              !canGoBack ? "cursor-not-allowed text-muted/40" : "text-ink-soft hover:text-ink"
            )}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          {!isLastStep ? (
            <button
              onClick={() => canContinue && go(step + 1)}
              disabled={!canContinue}
              className={cn("btn-primary text-base", !canContinue && "pointer-events-none opacity-40")}
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleBegin}
              disabled={!canContinue || loading}
              className={cn("btn-primary text-base", (!canContinue || loading) && "pointer-events-none opacity-70")}
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</>
                : <><Play className="h-4 w-4" /> Begin Interview</>
              }
            </button>
          )}
        </div>

        {/* Contextual hint when blocked */}
        {!canContinue && currentStep?.id === "docs" && (
          <p className="pb-3 text-center text-xs text-muted">
            {config.mode === "resume-only"
              ? "Upload your resume and enter the job role to continue."
              : config.mode === "custom"
                ? "Describe the interview you want (at least 20 characters)."
                : "Upload your resume and paste the job description to continue."}
          </p>
        )}
      </div>
    </main>
  );
}

function Stepper({ step, total, onJump }: { step: number; total: number; onJump: (i: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      {Array.from({ length: total }).map((_, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={i} className="flex flex-1 items-center gap-3">
            <button
              onClick={() => onJump(i)}
              disabled={i >= step}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                active
                  ? "border-ink bg-ink text-cream"
                  : done
                    ? "border-ink bg-cream text-ink hover:bg-paper"
                    : "border-line bg-paper text-muted"
              )}
            >
              {i + 1}
            </button>
            {i < total - 1 && (
              <div className="h-px flex-1 bg-line">
                <motion.div
                  className="h-px bg-ink"
                  initial={false}
                  animate={{ scaleX: done ? 1 : 0 }}
                  style={{ originX: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
