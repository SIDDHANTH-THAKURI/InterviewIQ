"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, Key, CheckCircle2, ExternalLink, ArrowRight, Trash2 } from "lucide-react";
import { saveKeys, loadKeys, clearKeys, keysAreSet } from "@/lib/keys";
import { EASE } from "@/components/ui/Reveal";
import { cn } from "@/lib/utils";

export default function KeysPage() {
  const router = useRouter();
  const [anthropic, setAnthropic] = useState("");
  const [elevenlabs, setElevenlabs] = useState("");
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [showElevenlabs, setShowElevenlabs] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const k = loadKeys();
    if (k.anthropic) setAnthropic(k.anthropic);
    if (k.elevenlabs) setElevenlabs(k.elevenlabs);
  }, []);

  const canSave = anthropic.trim().length > 10 && elevenlabs.trim().length > 10;

  const handleSave = () => {
    saveKeys({ anthropic: anthropic.trim(), elevenlabs: elevenlabs.trim() });
    setSaved(true);
    setTimeout(() => router.push("/setup"), 900);
  };

  const handleClear = () => {
    clearKeys();
    setAnthropic(""); setElevenlabs("");
    setSaved(false);
  };

  return (
    <main className="relative min-h-screen bg-cream grain">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="display text-xl font-semibold tracking-tight">
          Interview<span style={{ color: "var(--accent-ink)" }}>IQ</span>
        </Link>
      </header>

      <div className="mx-auto max-w-3xl px-6 pb-24 pt-4 sm:px-10">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
          <p className="eyebrow text-muted">Setup</p>
          <h1 className="display mt-3 text-4xl font-semibold sm:text-5xl">
            Add your API keys
          </h1>
          <p className="mt-4 max-w-xl leading-relaxed text-ink-soft">
            InterviewIQ uses your own API keys — your credits, your data, your privacy.
            Keys are stored only in this browser and sent directly to the interview server.
            They are never logged or stored on any server.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
          className="mt-10 space-y-5"
        >
          <KeyField
            label="Anthropic API Key"
            hint="Powers the interviewer's brain and feedback"
            placeholder="sk-ant-..."
            value={anthropic}
            onChange={setAnthropic}
            show={showAnthropic}
            onToggleShow={() => setShowAnthropic((v) => !v)}
            docsUrl="https://console.anthropic.com/settings/keys"
            docsLabel="Get key →"
            required
          />
          <KeyField
            label="ElevenLabs API Key"
            hint="Voices the interviewer AND transcribes your speech. Enable both 'Text to Speech' and 'Speech to Text' permissions on the key."
            placeholder="sk_..."
            value={elevenlabs}
            onChange={setElevenlabs}
            show={showElevenlabs}
            onToggleShow={() => setShowElevenlabs((v) => !v)}
            docsUrl="https://elevenlabs.io/app/settings/api-keys"
            docsLabel="Get key →"
            required
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="mt-8 flex items-center gap-4"
        >
          <button
            onClick={handleSave}
            disabled={!canSave || saved}
            className={cn(
              "btn-primary text-base",
              (!canSave || saved) && "pointer-events-none opacity-60"
            )}
          >
            {saved ? (
              <><CheckCircle2 className="h-4 w-4" /> Saved — redirecting…</>
            ) : (
              <>Save &amp; continue <ArrowRight className="h-4 w-4" /></>
            )}
          </button>
          {(anthropic || elevenlabs) && (
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
            >
              <Trash2 className="h-4 w-4" /> Clear all
            </button>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="mt-10 rounded-card border border-line bg-paper p-5 text-sm leading-relaxed text-muted"
        >
          <Key className="mb-2 h-4 w-4 text-accent" />
          <p>
            <strong className="text-ink">How it works:</strong> Your keys are saved in this
            browser&apos;s <code className="rounded bg-line px-1 py-0.5 text-xs">localStorage</code>.
            When you start an interview they are sent to the local WebSocket server over your
            own connection. Nothing leaves your machine.
          </p>
        </motion.div>
      </div>
    </main>
  );
}

interface KeyFieldProps {
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  docsUrl: string;
  docsLabel: string;
  required?: boolean;
}

function KeyField({ label, hint, placeholder, value, onChange, show, onToggleShow, docsUrl, docsLabel, required }: KeyFieldProps) {
  const hasValue = value.trim().length > 6;
  return (
    <div className="rounded-card border border-line bg-paper p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 font-medium text-ink">
            {label}
            {required && <span className="text-accent">*</span>}
            {hasValue && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          </div>
          <p className="mt-0.5 text-xs text-muted">{hint}</p>
        </div>
        <a href={docsUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
          {docsLabel} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-soft border border-line bg-cream px-4 py-3 pr-11 font-mono text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
