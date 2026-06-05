"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, FileText, Check, Loader2, X, AlertCircle } from "lucide-react";
import { useInterviewStore } from "@/store/interviewStore";
import { extractDocumentText, wordCount } from "@/lib/parsePDF";
import { cn } from "@/lib/utils";

type DocKey = "resumeText" | "coverLetterText" | "jobDescription";

interface FieldMeta {
  fileName?: string;
  parsing: boolean;
  error?: string;
}

const initialMeta: Record<DocKey, FieldMeta> = {
  resumeText: { parsing: false },
  coverLetterText: { parsing: false },
  jobDescription: { parsing: false },
};

export function DocumentUpload() {
  const documents = useInterviewStore((s) => s.documents);
  const config = useInterviewStore((s) => s.config);
  const setDocuments = useInterviewStore((s) => s.setDocuments);
  const setConfig = useInterviewStore((s) => s.setConfig);
  const [meta, setMeta] = useState(initialMeta);
  const mode = config.mode;

  const patchMeta = useCallback((key: DocKey, m: Partial<FieldMeta>) => {
    setMeta((prev) => ({ ...prev, [key]: { ...prev[key], ...m } }));
  }, []);

  const handleFile = useCallback(
    async (key: DocKey, file: File) => {
      patchMeta(key, { parsing: true, error: undefined, fileName: file.name });
      try {
        const text = await extractDocumentText(file);
        if (!text.trim()) throw new Error("No readable text found in that file.");
        setDocuments({ [key]: text });
        patchMeta(key, { parsing: false });
      } catch (err) {
        patchMeta(key, {
          parsing: false,
          error: (err as Error).message || "Could not read that file.",
        });
      }
    },
    [patchMeta, setDocuments]
  );

  const clearField = useCallback(
    (key: DocKey) => {
      setDocuments({ [key]: "" });
      setMeta((prev) => ({ ...prev, [key]: { parsing: false } }));
    },
    [setDocuments]
  );

  // resume-only: show resume + role field
  if (mode === "resume-only") {
    return (
      <div className="space-y-6">
        <DropZone
          title="Resume"
          hint="PDF — parsed privately in your browser"
          accept=".pdf,application/pdf"
          required
          value={documents.resumeText}
          meta={meta.resumeText}
          onFile={(f) => handleFile("resumeText", f)}
          onClear={() => clearField("resumeText")}
        />
        <div>
          <span className="eyebrow text-muted">Job role <span className="text-accent">*</span></span>
          <input
            type="text"
            value={config.jobRole ?? ""}
            onChange={(e) => setConfig({ jobRole: e.target.value })}
            placeholder="e.g. Senior Backend Engineer, Product Manager at a fintech startup…"
            className="mt-3 w-full rounded-card border border-line bg-paper px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
          />
        </div>
      </div>
    );
  }

  // custom: show only the prompt textarea
  if (mode === "custom") {
    return (
      <div>
        <span className="eyebrow text-muted">Describe your interview <span className="text-accent">*</span></span>
        <textarea
          value={config.customPrompt ?? ""}
          onChange={(e) => setConfig({ customPrompt: e.target.value })}
          placeholder="e.g. 'A senior product manager interview at a late-stage startup. Focus on strategy, metrics and cross-functional leadership. Be tough but fair.'"
          rows={7}
          className="mt-3 w-full resize-y rounded-card border border-line bg-paper p-4 text-sm leading-relaxed text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
        />
        <p className="mt-2 text-xs text-muted">{(config.customPrompt ?? "").length} chars — 20 minimum to continue.</p>
      </div>
    );
  }

  // standard: all three fields
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <DropZone
        title="Resume"
        hint="PDF — parsed privately in your browser"
        accept=".pdf,application/pdf"
        required
        value={documents.resumeText}
        meta={meta.resumeText}
        onFile={(f) => handleFile("resumeText", f)}
        onClear={() => clearField("resumeText")}
      />
      <DropZone
        title="Cover letter"
        hint="PDF or text — optional"
        accept=".pdf,.txt,.md,application/pdf,text/plain"
        value={documents.coverLetterText}
        meta={meta.coverLetterText}
        onFile={(f) => handleFile("coverLetterText", f)}
        onClear={() => clearField("coverLetterText")}
      />
      <JobDescriptionField
        value={documents.jobDescription}
        meta={meta.jobDescription}
        onText={(t) => setDocuments({ jobDescription: t })}
        onFile={(f) => handleFile("jobDescription", f)}
        onClear={() => clearField("jobDescription")}
        className="lg:col-span-2"
      />
    </div>
  );
}

/* ───────────────────────────── Drop zone ────────────────────────────────── */

interface DropZoneProps {
  title: string;
  hint: string;
  accept: string;
  required?: boolean;
  value: string;
  meta: FieldMeta;
  onFile: (file: File) => void;
  onClear: () => void;
  className?: string;
}

function DropZone({
  title,
  hint,
  accept,
  required,
  value,
  meta,
  onFile,
  onClear,
  className,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const hasValue = value.trim().length > 0;

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2">
        <span className="eyebrow text-muted">{title}</span>
        {required && <span className="text-accent">*</span>}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => !meta.parsing && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "group relative flex min-h-[148px] cursor-pointer flex-col items-center justify-center rounded-card border border-dashed p-6 text-center transition-all duration-200",
          dragOver
            ? "border-accent bg-accent/5"
            : hasValue
              ? "border-line bg-paper"
              : "border-line bg-paper/60 hover:border-ink/40 hover:bg-paper"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />

        {meta.parsing ? (
          <div className="flex flex-col items-center gap-2 text-ink-soft">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
            <span className="text-sm">Reading {meta.fileName}…</span>
          </div>
        ) : hasValue ? (
          <div className="flex w-full flex-col items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-cream">
              <Check className="h-5 w-5" />
            </div>
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <FileText className="h-4 w-4 text-muted" />
              {meta.fileName ?? "Added"}
            </p>
            <p className="text-xs text-muted">{wordCount(value).toLocaleString()} words parsed</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              <X className="h-3 w-3" /> Replace
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-ink-soft">
            <UploadCloud className="h-7 w-7 text-muted transition-colors group-hover:text-ink" />
            <p className="text-sm font-medium text-ink">Drag &amp; drop, or browse</p>
            <p className="text-xs text-muted">{hint}</p>
          </div>
        )}
      </div>

      {meta.error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" /> {meta.error}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────── Job description ────────────────────────────── */

interface JDProps {
  value: string;
  meta: FieldMeta;
  onText: (text: string) => void;
  onFile: (file: File) => void;
  onClear: () => void;
  className?: string;
}

function JobDescriptionField({ value, meta, onText, onFile, onClear, className }: JDProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="eyebrow text-muted">Job description</span>
          <span className="text-accent">*</span>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          {meta.parsing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UploadCloud className="h-3.5 w-3.5" />
          )}
          Upload PDF instead
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.md,application/pdf,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onText(e.target.value)}
          placeholder="Paste the job description here — the more detail, the sharper the interview."
          rows={7}
          className="w-full resize-y rounded-card border border-line bg-paper p-4 text-sm leading-relaxed text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
        />
        {value.trim() && (
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>{wordCount(value).toLocaleString()} words</span>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 underline-offset-2 hover:text-ink hover:underline"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          </div>
        )}
      </div>
      {meta.error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" /> {meta.error}
        </p>
      )}
    </div>
  );
}
