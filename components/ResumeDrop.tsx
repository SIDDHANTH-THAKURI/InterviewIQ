"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, ClipboardPaste, FileText, Upload, X } from "lucide-react";
import { Button, Textarea } from "@/components/ui/kit";
import { extractText, wordCount } from "@/lib/client/documents";
import { cn } from "@/lib/cn";

/** Drag-and-drop resume (PDF/TXT/MD) or paste; parsed locally. */
export function ResumeDrop({
  text,
  fileName,
  onChange,
  compact,
}: {
  text: string;
  fileName?: string;
  onChange: (text: string, fileName?: string) => void;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pasting, setPasting] = useState(false);

  const handle = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onChange(await extractText(file), file.name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (text && !pasting) {
    return (
      <div className="flex items-center gap-3.5 rounded-2xl border border-good/25 bg-good/[0.05] p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-good/15 text-good">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{fileName || "Pasted resume"}</p>
          <p className="text-xs text-mute">{wordCount(text).toLocaleString()} words · read on your device</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setPasting(true)}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" aria-label="Remove resume" onClick={() => onChange("", undefined)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (pasting) {
    return (
      <div className="space-y-2">
        <Textarea
          autoFocus
          className="min-h-48 font-mono text-[13px]"
          placeholder="Paste your resume text here…"
          value={text}
          onChange={(e) => onChange(e.target.value, fileName)}
        />
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={() => setPasting(false)}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handle(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed text-center transition",
          compact ? "px-5 py-7" : "px-6 py-12",
          drag ? "border-ember/60 bg-ember/[0.06]" : "border-white/15 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.035]"
        )}
      >
        <AnimatePresence mode="wait">
          {busy ? (
            <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center">
              <FileText className="h-7 w-7 animate-pulse text-ember-soft" />
              <p className="mt-3 text-sm text-paper-dim">Reading your resume…</p>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.05] text-paper-dim transition group-hover:scale-105 group-hover:text-ember-soft">
                <Upload className="h-5 w-5" />
              </span>
              <p className="mt-4 text-[15px] font-medium">Drop your resume, or click to choose</p>
              <p className="mt-1 text-xs text-mute">PDF, TXT or Markdown · it never leaves your device</p>
            </motion.div>
          )}
        </AnimatePresence>
        <input
          ref={input}
          type="file"
          accept=".pdf,.txt,.md,application/pdf,text/plain"
          className="hidden"
          onChange={(e) => {
            void handle(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-sm text-bad">{error}</p>
        <button
          type="button"
          onClick={() => setPasting(true)}
          className="flex items-center gap-1.5 text-xs text-mute hover:text-paper"
        >
          <ClipboardPaste className="h-3.5 w-3.5" /> Paste text instead
        </button>
      </div>
    </div>
  );
}
