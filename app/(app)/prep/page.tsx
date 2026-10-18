"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, BookOpenCheck, Globe, Sparkles } from "lucide-react";
import { AuraOrb } from "@/components/aura/AuraOrb";
import { Badge, Button, Card, Eyebrow, Field, Input, Textarea, Toggle } from "@/components/ui/kit";
import { api } from "@/lib/client/api";
import { listPreps, newId, putPrep, type PrepRecord } from "@/lib/client/db";
import { useApp } from "@/lib/client/store";
import { timeAgo } from "@/lib/cn";
import type { PrepPack } from "@/types/interview";

const STEPS = [
  "Reading the job post…",
  "Matching it to your experience…",
  "Predicting the questions they'll ask…",
  "Building your story bank…",
  "Writing questions for you to ask them…",
];

export default function PrepPage() {
  const router = useRouter();
  const { profile, access, refreshAccess } = useApp();
  const [preps, setPreps] = useState<PrepRecord[]>([]);
  const [role, setRole] = useState(profile?.targetRole ?? "");
  const [company, setCompany] = useState("");
  const [jd, setJd] = useState("");
  const [research, setResearch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => void listPreps().then(setPreps), []);
  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 7000);
    return () => clearInterval(t);
  }, [busy]);

  const left = access?.limits.prepsPerMonth != null ? Math.max(0, access.limits.prepsPerMonth - access.usage.preps) : null;

  const build = async () => {
    setBusy(true);
    setError("");
    try {
      const { pack } = await api<{ pack: PrepPack }>("/api/prep", {
        method: "POST",
        body: JSON.stringify({
          role,
          company,
          jobDescription: jd,
          resumeText: profile?.resumeText,
          experienceLevel: profile?.experienceLevel,
          research: research && !!company.trim(),
        }),
      });
      const id = newId();
      await putPrep({ id, createdAt: Date.now(), role: pack.role || role, company: company.trim() || pack.company, jobDescription: jd.trim() || undefined, pack });
      void refreshAccess();
      router.push(`/prep/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div>
      <Eyebrow>Prep packs</Eyebrow>
      <h1 className="display mt-3 text-[clamp(2.4rem,5vw,3.75rem)]">
        Know what's <span className="italic text-ember-grad">coming</span>.
      </h1>
      <p className="mt-3 max-w-xl text-[15px] text-mute">
        Paste a job post. Get the questions they're likely to ask, which of your stories answers each one, the gaps to get ahead of, and
        smart questions to ask back.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card className="relative overflow-hidden">
          <AnimatePresence mode="wait">
            {busy ? (
              <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-[26rem] flex-col items-center justify-center text-center">
                <div className="h-48 w-48">
                  <AuraOrb mood="thinking" energy={0.85} className="h-full w-full" />
                </div>
                <AnimatePresence mode="wait">
                  <motion.p key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-2 text-[15px] text-paper-dim">
                    {STEPS[step]}
                  </motion.p>
                </AnimatePresence>
                <p className="mt-2 text-xs text-faint">This takes about a minute{research && company ? " (a little longer with research)" : ""}.</p>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Role">
                    <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Junior Data Analyst" />
                  </Field>
                  <Field label="Company">
                    <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="optional" />
                  </Field>
                </div>
                <Field label="Job description" hint="The more detail, the sharper the pack.">
                  <Textarea className="min-h-56 text-[13.5px]" value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the full job post here…" />
                </Field>
                <Toggle
                  checked={research && !!company.trim()}
                  disabled={!company.trim()}
                  onChange={setResearch}
                  icon={<Globe className="h-4 w-4" />}
                  label="Research the company"
                  description={company.trim() ? `Searches the web for recent news and culture at ${company.trim()}.` : "Add a company name to enable."}
                />
                {!profile?.resumeText && (
                  <p className="text-[13px] text-warn">
                    Tip: add your resume in <Link href="/profile" className="underline underline-offset-4">Profile</Link> — your story bank is built from it.
                  </p>
                )}
                {error && <p className="text-sm text-bad">{error}</p>}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-faint">{left != null ? `${left} pack${left === 1 ? "" : "s"} left this month` : ""}</span>
                  <Button variant="glow" size="lg" onClick={build} disabled={role.trim().length < 2 || left === 0}>
                    <Sparkles className="h-4 w-4" /> Build my prep pack
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-faint">Your packs</p>
          {preps.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-mute">Your prep packs will appear here, saved on this device.</div>
          )}
          {preps.map((p) => (
            <Link key={p.id} href={`/prep/${p.id}`} className="glass group flex items-center gap-4 rounded-2xl p-4 transition hover:-translate-y-0.5">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-iris/10 text-iris">
                <BookOpenCheck className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.role}</span>
                <span className="block truncate text-xs text-mute">
                  {p.company ? `${p.company} · ` : ""}
                  {p.pack.questions.length} questions · {timeAgo(p.createdAt)}
                </span>
              </span>
              {p.practiced?.length ? <Badge tone="good">{p.practiced.length} practiced</Badge> : null}
              <ArrowRight className="h-4 w-4 text-faint group-hover:text-paper" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
