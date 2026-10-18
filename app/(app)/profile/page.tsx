"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, KeyRound, LogOut, Save, ShieldCheck, Sparkles, Trash2, Upload } from "lucide-react";
import { ResumeDrop } from "@/components/ResumeDrop";
import { Badge, Button, Card, Eyebrow, Field, Input, Modal, useToast } from "@/components/ui/kit";
import { api, maskKey } from "@/lib/client/api";
import { exportAll, importAll, wipeAll, type Backup } from "@/lib/client/db";
import { useApp } from "@/lib/client/store";
import { LANGUAGE_LABELS, type CandidateProfile, type InterviewLanguage } from "@/types/interview";
import type { ResumeInsights } from "@/lib/ai/prep";

const LEVELS: Record<CandidateProfile["experienceLevel"], string> = {
  student: "Student / intern",
  entry: "Early career",
  mid: "Mid-level",
  senior: "Senior",
  lead: "Lead / manager",
  "career-change": "Changing careers",
};

export default function ProfilePage() {
  const router = useRouter();
  const { profile, access, mode, ownKeys, updateProfile, signOut, bootstrap } = useApp();
  const [draft, setDraft] = useState<CandidateProfile | null>(profile);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [toast, show] = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!draft) return null;
  const set = <K extends keyof CandidateProfile>(k: K, v: CandidateProfile[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);

  const save = async () => {
    setSaving(true);
    await updateProfile(draft);
    setSaving(false);
    show("Saved");
  };

  const reanalyze = async () => {
    if (!draft.resumeText) return;
    setAnalyzing(true);
    try {
      const { insights } = await api<{ insights: ResumeInsights }>("/api/profile/analyze", {
        method: "POST",
        body: JSON.stringify({ resumeText: draft.resumeText }),
      });
      setDraft((d) => (d ? { ...d, headline: insights.headline, summary: insights.summary, skills: insights.skills } : d));
      show("Resume summary updated — remember to save");
    } catch (err) {
      show((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const doExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `interviewiq-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doImport = async (file?: File | null) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as Backup;
      const r = await importAll(data);
      await bootstrap(true);
      show(`Restored ${r.sessions} sessions and ${r.preps} prep packs`);
      setDraft(useApp.getState().profile);
    } catch (err) {
      show((err as Error).message || "Couldn't read that backup");
    }
  };

  return (
    <div>
      <Eyebrow>Profile</Eyebrow>
      <h1 className="display mt-3 text-[clamp(2.4rem,5vw,3.75rem)]">
        About <span className="italic text-ember-grad">you</span>
      </h1>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="Target role">
                <Input value={draft.targetRole} onChange={(e) => set("targetRole", e.target.value)} />
              </Field>
              <Field label="Experience">
                <select
                  value={draft.experienceLevel}
                  onChange={(e) => set("experienceLevel", e.target.value as CandidateProfile["experienceLevel"])}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-ink-800 px-4 text-[15px] outline-none focus:border-ember/50"
                >
                  {Object.entries(LEVELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Default language">
                <select
                  value={draft.preferredLanguage}
                  onChange={(e) => set("preferredLanguage", e.target.value as InterviewLanguage)}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-ink-800 px-4 text-[15px] outline-none focus:border-ember/50"
                >
                  {(Object.keys(LANGUAGE_LABELS) as InterviewLanguage[]).map((l) => (
                    <option key={l} value={l}>
                      {LANGUAGE_LABELS[l]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={`Interview nerves · ${["", "calm", "mostly fine", "nervous", "very nervous", "dread them"][draft.nerves]}`} hint="Higher = gentler defaults.">
              <input type="range" min={1} max={5} value={draft.nerves} onChange={(e) => set("nerves", Number(e.target.value))} className="w-full accent-[#7dd3fc]" />
            </Field>
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Resume</h2>
              {draft.resumeText && (
                <Button size="sm" variant="ghost" loading={analyzing} onClick={reanalyze}>
                  <Sparkles className="h-3.5 w-3.5" /> Refresh summary
                </Button>
              )}
            </div>
            <ResumeDrop
              text={draft.resumeText}
              fileName={draft.resumeFileName}
              onChange={(text, fileName) => setDraft((d) => (d ? { ...d, resumeText: text, resumeFileName: fileName } : d))}
            />
            {draft.headline && (
              <div className="rounded-2xl border border-iris/20 bg-iris/[0.05] p-4">
                <p className="text-sm font-medium text-iris">{draft.headline}</p>
                {draft.summary && <p className="mt-1.5 text-sm text-paper-dim">{draft.summary}</p>}
                {draft.skills?.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {draft.skills.map((s) => (
                      <Badge key={s}>{s}</Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </Card>

          <div className="flex justify-end">
            <Button variant="glow" disabled={!dirty} loading={saving} onClick={save}>
              <Save className="h-4 w-4" /> Save changes
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <ShieldCheck className="h-4 w-4 text-good" /> Your data
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-mute">
              Everything — resume, transcripts, reports, prep packs — is stored only in this browser. Export a backup to move it to another
              device.
            </p>
            <div className="mt-5 grid gap-2">
              <Button variant="secondary" onClick={doExport}>
                <Download className="h-4 w-4" /> Export backup
              </Button>
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> Restore from backup
              </Button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void doImport(e.target.files?.[0])} />
              <Button variant="danger" onClick={() => setConfirmWipe(true)}>
                <Trash2 className="h-4 w-4" /> Delete everything on this device
              </Button>
            </div>
          </Card>

          {mode === "byok" && (
            <Card>
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <KeyRound className="h-4 w-4 text-gold" /> Your keys
              </h2>
              <p className="mt-2 text-sm text-mute">Stored only in this browser and used only for your sessions.</p>
              <dl className="mt-4 space-y-2 font-mono text-[12.5px]">
                {(
                  [
                    ["Anthropic", ownKeys?.anthropic],
                    ["ElevenLabs", ownKeys?.elevenlabs],
                    ["Deepgram", ownKeys?.deepgram],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between rounded-xl border hairline px-3 py-2">
                    <dt className="font-sans text-paper-dim">{k}</dt>
                    <dd className={v ? "text-paper-dim" : "text-faint"}>{v ? maskKey(v) : "not added"}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 grid gap-2">
                <Button variant="secondary" href="/keys">
                  Change keys
                </Button>
                <Button variant="ghost" onClick={() => setConfirmSignOut(true)}>
                  <LogOut className="h-4 w-4" /> Remove keys from this device
                </Button>
              </div>
            </Card>
          )}

          {access && (
            <Card>
              <h2 className="text-[15px] font-semibold">This month</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border hairline p-4">
                  <p className="text-2xl font-semibold tabular-nums">{Math.round(access.usage.minutes)}</p>
                  <p className="text-xs text-mute">
                    minutes used{access.limits.minutesPerMonth != null ? ` of ${access.limits.minutesPerMonth}` : ""}
                  </p>
                </div>
                <div className="rounded-2xl border hairline p-4">
                  <p className="text-2xl font-semibold tabular-nums">{access.usage.preps}</p>
                  <p className="text-xs text-mute">prep packs{access.limits.prepsPerMonth != null ? ` of ${access.limits.prepsPerMonth}` : ""}</p>
                </div>
              </div>
              <Button variant="ghost" className="mt-4 w-full" onClick={() => setConfirmSignOut(true)}>
                <LogOut className="h-4 w-4" /> Forget my invite on this device
              </Button>
            </Card>
          )}
        </div>
      </div>

      <Modal open={confirmWipe} onClose={() => setConfirmWipe(false)} title="Delete everything?">
        <p className="-mt-1 text-sm text-mute">Your profile, resume, every session and prep pack on this device will be permanently removed. Export a backup first if you might want them.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmWipe(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await wipeAll();
              await bootstrap(true);
              router.replace("/onboarding");
            }}
          >
            Delete everything
          </Button>
        </div>
      </Modal>

      <Modal open={confirmSignOut} onClose={() => setConfirmSignOut(false)} title={mode === "byok" ? "Remove your keys?" : "Forget your invite here?"}>
        <p className="-mt-1 text-sm text-mute">
          {mode === "byok"
            ? "Your keys will be deleted from this browser. Your saved sessions stay on this device."
            : "You'll need your invite link to get back in. Your saved sessions stay on this device."}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmSignOut(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              signOut();
              router.replace("/");
            }}
          >
            {mode === "byok" ? "Remove keys" : "Forget invite"}
          </Button>
        </div>
      </Modal>
      {toast}
    </div>
  );
}
