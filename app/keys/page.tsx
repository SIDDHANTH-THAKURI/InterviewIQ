"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Lock, ShieldCheck, XCircle } from "lucide-react";
import { Badge, Button, Eyebrow, Input, Logo } from "@/components/ui/kit";
import { api, ApiError, fetchConfig, getOwnKeys, getPass, setOwnKeys, type OwnKeys } from "@/lib/client/api";
import { getProfile } from "@/lib/client/db";
import { useApp } from "@/lib/client/store";
import { cn } from "@/lib/cn";

type Provider = keyof OwnKeys;
type TestResult = { ok: boolean; message: string } | null;

const PROVIDERS: { id: Provider; name: string; powers: string; required: boolean; url: string; placeholder: string }[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    powers: "The interviewer's brain, your reports and prep packs.",
    required: true,
    url: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-…",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    powers: "The interviewer's voice. Without it you get captions only.",
    required: false,
    url: "https://elevenlabs.io/app/settings/api-keys",
    placeholder: "sk_…",
  },
  {
    id: "deepgram",
    name: "Deepgram",
    powers: "Hearing your spoken answers. Without it you type your answers.",
    required: false,
    url: "https://console.deepgram.com/",
    placeholder: "Your Deepgram API key",
  },
];

const EASE = [0.16, 1, 0.3, 1] as const;

export default function KeysPage() {
  const router = useRouter();
  const bootstrap = useApp((s) => s.bootstrap);
  const [keys, setKeys] = useState<OwnKeys>({ anthropic: "", elevenlabs: "", deepgram: "" });
  const [show, setShow] = useState<Record<Provider, boolean>>({ anthropic: false, elevenlabs: false, deepgram: false });
  const [results, setResults] = useState<Record<Provider, TestResult>>({ anthropic: null, elevenlabs: null, deepgram: null });
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [hasInvite, setHasInvite] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const existing = getOwnKeys();
    if (existing) {
      setKeys({ anthropic: existing.anthropic, elevenlabs: existing.elevenlabs ?? "", deepgram: existing.deepgram ?? "" });
      setEditing(true);
    }
    setHasInvite(!!getPass());
    fetchConfig()
      .then((c) => setEnabled(c.byok))
      .catch(() => setEnabled(true));
  }, []);

  const verified = results.anthropic?.ok === true;

  const test = async () => {
    setTesting(true);
    setError("");
    try {
      const r = await api<Record<Provider, TestResult>>("/api/keys/test", {
        method: "POST",
        pass: "",
        body: JSON.stringify(keys),
      });
      setResults(r);
      return r;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server.");
      return null;
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    const r = verified ? results : await test();
    if (!r?.anthropic?.ok) return;
    setOwnKeys({
      anthropic: keys.anthropic,
      elevenlabs: r.elevenlabs?.ok ? keys.elevenlabs : undefined,
      deepgram: r.deepgram?.ok ? keys.deepgram : undefined,
    });
    await bootstrap(true);
    const profile = await getProfile();
    router.replace(profile ? (editing ? "/profile" : "/home") : "/onboarding");
  };

  if (enabled === false) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="glass max-w-md rounded-xl3 p-8">
          <Lock className="mx-auto h-8 w-8 text-mute" />
          <h1 className="mt-4 text-xl font-semibold">This copy of InterviewIQ is invite-only</h1>
          <p className="mt-2 text-sm text-mute">Ask the owner for an invite link.</p>
          <Button href="/" variant="secondary" className="mt-6">
            Back home
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-dvh px-5 py-8 sm:px-10">
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-30" />
      <div className="relative mx-auto flex max-w-5xl items-center justify-between">
        <Logo />
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-mute hover:text-paper">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      </div>

      <div className="relative mx-auto mt-12 grid max-w-5xl gap-10 lg:grid-cols-[1.2fr_1fr]">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}>
          <Eyebrow>{editing ? "Your keys" : "Use your own keys"}</Eyebrow>
          <h1 className="display mt-3 text-[clamp(2.4rem,5vw,3.75rem)]">
            Bring your <span className="italic text-ember-grad">own keys</span>.
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-mute">
            InterviewIQ runs on three AI services. Paste your keys and you pay those providers directly for what you use — usually a few
            cents per practice session. No account needed here.
          </p>

          {hasInvite && (
            <p className="mt-5 rounded-2xl border border-good/25 bg-good/[0.06] p-4 text-sm text-paper-dim">
              You already have an invite on this device, so you don't need keys — practice is covered for you.
            </p>
          )}

          <div className="mt-8 space-y-4">
            {PROVIDERS.map((p) => {
              const r = results[p.id];
              return (
                <div key={p.id} className={cn("glass rounded-2xl p-5", r?.ok === false && "border-bad/30")}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 font-medium">
                      {p.name}
                      {p.required ? <Badge tone="ember">required</Badge> : <Badge>optional</Badge>}
                    </p>
                    <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-mute hover:text-paper">
                      Get a key <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <p className="mt-1 text-[13px] text-mute">{p.powers}</p>
                  <div className="relative mt-3">
                    <Input
                      type={show[p.id] ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={p.placeholder}
                      value={keys[p.id] ?? ""}
                      onChange={(e) => {
                        setKeys((k) => ({ ...k, [p.id]: e.target.value.trim() }));
                        setResults((rs) => ({ ...rs, [p.id]: null }));
                      }}
                      className="pr-12 font-mono text-[13.5px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((s) => ({ ...s, [p.id]: !s[p.id] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-mute hover:text-paper"
                      aria-label={show[p.id] ? "Hide key" : "Show key"}
                    >
                      {show[p.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {r && (
                    <p className={cn("mt-2 flex items-center gap-1.5 text-xs", r.ok ? "text-good" : "text-bad")}>
                      {r.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />} {r.message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {error && <p className="mt-4 text-sm text-bad">{error}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="secondary" size="lg" loading={testing} disabled={keys.anthropic.length < 20} onClick={test}>
              <KeyRound className="h-4 w-4" /> Test keys
            </Button>
            <Button variant="glow" size="lg" disabled={keys.anthropic.length < 20 || testing || results.anthropic?.ok === false} onClick={save}>
              {editing ? "Save keys" : "Save & continue"} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}
          className="space-y-4 lg:pt-28"
        >
          <div className="glass rounded-2xl p-6">
            <p className="flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4 text-good" /> How your keys are handled
            </p>
            <ul className="mt-4 space-y-3 text-[13.5px] leading-relaxed text-paper-dim">
              <li>Saved only in this browser — never in a database or on our server's disk.</li>
              <li>Sent over an encrypted connection with each session, used for that session only, and never logged.</li>
              <li>Only ever used for your own practice. Your sessions never run on anyone else's keys, and no one else's run on yours.</li>
              <li>You can remove them any time from your profile.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-white/10 p-6 text-[13.5px] leading-relaxed text-mute">
            <p className="font-medium text-paper-dim">Tip</p>
            <p className="mt-2">
              Set a monthly spend limit in each provider's dashboard, and create keys just for this app so you can revoke them on their
              own. Want zero trust in this server? The project is open source — you can run your own copy.
            </p>
          </div>
        </motion.aside>
      </div>
    </main>
  );
}
