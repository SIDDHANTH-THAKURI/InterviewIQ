"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Check,
  Copy,
  KeyRound,
  Link2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Badge, Button, Card, Eyebrow, Field, FullScreenLoader, Input, Logo, Modal, Segmented, useToast } from "@/components/ui/kit";
import { api, ApiError, fetchAccess, getPass, setPass } from "@/lib/client/api";
import { cn, timeAgo } from "@/lib/cn";
import type { MemberView } from "@/lib/server/members";

type Limit = "60" | "120" | "300" | "none";
type Expiry = "never" | "30" | "90";

export default function AdminPage() {
  const [state, setState] = useState<"checking" | "login" | "ready">("checking");

  useEffect(() => {
    const pass = getPass();
    if (!pass) return setState("login");
    fetchAccess()
      .then(({ access }) => setState(access.role === "admin" ? "ready" : "login"))
      .catch(() => setState("login"));
  }, []);

  if (state === "checking") return <FullScreenLoader />;
  if (state === "login") return <Login onDone={() => setState("ready")} />;
  return <Console />;
}

/* ───────────────────────────── login ───────────────────────────── */

function Login({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { pass } = await api<{ pass: string }>("/api/admin/login", { method: "POST", body: JSON.stringify({ passcode: code }) });
      setPass(pass);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <form onSubmit={submit} className="glass w-full max-w-sm rounded-xl3 p-8">
        <Logo />
        <h1 className="mt-6 flex items-center gap-2 text-xl font-semibold">
          <Shield className="h-5 w-5 text-ember-soft" /> Owner console
        </h1>
        <p className="mt-1.5 text-sm text-mute">Enter the ADMIN_PASSCODE from your server's .env.local.</p>
        <Input type="password" autoFocus className="mt-6" placeholder="Passcode" value={code} onChange={(e) => setCode(e.target.value)} />
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        <Button type="submit" variant="glow" className="mt-5 w-full" loading={busy} disabled={!code}>
          Unlock <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </main>
  );
}

/* ───────────────────────────── console ───────────────────────────── */

function inviteUrl(token: string) {
  return `${window.location.origin}/join/${token}`;
}

function Console() {
  const [members, setMembers] = useState<MemberView[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<MemberView | null>(null);
  const [editing, setEditing] = useState<MemberView | null>(null);
  const [toast, show] = useToast();
  const [isLocal, setIsLocal] = useState(false);

  const load = useCallback(() => {
    api<{ members: MemberView[] }>("/api/admin/members").then((r) => setMembers(r.members));
  }, []);
  useEffect(() => {
    load();
    setIsLocal(/^(localhost|127\.|\[::1\])/.test(window.location.hostname));
  }, [load]);

  const patch = async (id: string, body: Record<string, unknown>, msg: string) => {
    await api(`/api/admin/members/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    show(msg);
    load();
  };

  const copy = (m: MemberView) => {
    void navigator.clipboard.writeText(inviteUrl(m.token));
    show(`Link for ${m.name} copied`);
  };

  const friends = (members ?? []).filter((m) => m.role !== "admin");
  const owner = (members ?? []).find((m) => m.role === "admin");
  const month = (members ?? []).reduce(
    (t, m) => ({ minutes: t.minutes + m.month.minutes, cost: t.cost + m.month.costUsd, sessions: t.sessions + m.month.sessions }),
    { minutes: 0, cost: 0, sessions: 0 }
  );
  const lifetimeCost = (members ?? []).reduce((t, m) => t + m.lifetime.costUsd, 0);
  const active = friends.filter((m) => m.lastSeenAt && Date.now() - m.lastSeenAt < 30 * 86400000).length;

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <header className="flex items-center justify-between">
        <Logo />
        <Button href="/home" variant="secondary" size="sm">
          Open the app <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </header>

      <div className="mt-12 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Owner console</Eyebrow>
          <h1 className="display mt-3 text-[clamp(2.4rem,5vw,3.75rem)]">
            Who you're <span className="italic text-ember-grad">helping</span>
          </h1>
        </div>
        <Button variant="glow" size="lg" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New invite
        </Button>
      </div>

      {isLocal && (
        <div className="mt-6 flex gap-3 rounded-2xl border border-warn/25 bg-warn/[0.06] p-4 text-sm text-paper-dim">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <p>
            You're on <b>localhost</b>, so invite links will only open on this computer. To share with a friend, run a tunnel (for example{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px]">cloudflared tunnel --url http://localhost:3000</code>) and open this
            console from that https address — links then use it automatically.
          </p>
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Friends invited" value={friends.length} note={`${active} active in 30 days`} />
        <Stat label="Sessions this month" value={month.sessions} />
        <Stat label="Minutes this month" value={Math.round(month.minutes)} />
        <Stat label="Est. cost this month" value={`$${month.cost.toFixed(2)}`} note={`$${lifetimeCost.toFixed(2)} all time`} />
      </div>

      <Card className="mt-6 p-0">
        <div className="flex items-center justify-between border-b hairline px-6 py-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Users className="h-4 w-4 text-mute" /> Members
          </h2>
          <button onClick={load} className="text-mute hover:text-paper" aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        {!members ? (
          <p className="px-6 py-10 text-center text-sm text-mute">Loading…</p>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {[...(owner ? [owner] : []), ...friends].map((m) => (
              <MemberRow
                key={m.id}
                m={m}
                onCopy={() => copy(m)}
                onEdit={() => setEditing(m)}
                onToggle={() => patch(m.id, { revoked: !m.revoked }, m.revoked ? `${m.name} can practice again` : `${m.name} is paused`)}
              />
            ))}
            {friends.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-mute">No friends invited yet. Create an invite and send them the link — that's all they need.</p>
              </div>
            )}
          </div>
        )}
      </Card>

      <CreateModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(m) => {
          setCreating(false);
          setCreated(m);
          load();
        }}
      />
      <CreatedModal m={created} onClose={() => setCreated(null)} />
      <EditModal
        m={editing}
        onClose={() => setEditing(null)}
        onSaved={(msg) => {
          setEditing(null);
          show(msg);
          load();
        }}
      />
      {toast}
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-xs text-mute">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      {note && <p className="mt-1 text-xs text-faint">{note}</p>}
    </div>
  );
}

function MemberRow({ m, onCopy, onEdit, onToggle }: { m: MemberView; onCopy: () => void; onEdit: () => void; onToggle: () => void }) {
  const owner = m.role === "admin";
  const limit = m.limits.minutesPerMonth;
  const pct = limit ? Math.min(100, (m.month.minutes / limit) * 100) : 0;
  const expired = m.expiresAt != null && m.expiresAt < Date.now();
  return (
    <div className="grid items-center gap-4 px-6 py-4 md:grid-cols-[1.4fr_1fr_0.7fr_auto]">
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold", owner ? "bg-ember/15 text-ember-soft" : "bg-white/[0.06] text-paper-dim")}>
          {m.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-medium">
            {m.name}
            {owner && <Badge tone="ember">you</Badge>}
            {m.revoked && <Badge tone="warn">paused</Badge>}
            {expired && <Badge tone="bad">expired</Badge>}
          </p>
          <p className="truncate text-xs text-mute">
            {m.note ? `${m.note} · ` : ""}
            {m.lastSeenAt ? `active ${timeAgo(m.lastSeenAt)}` : "hasn't opened it yet"}
          </p>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-xs">
          <span className="text-mute">{Math.round(m.month.minutes)} min this month</span>
          <span className="text-faint">{limit != null ? `of ${limit}` : "no limit"}</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-ember/12">
          <div className={cn("h-full rounded-full", pct >= 90 ? "bg-warn" : "bg-ember")} style={{ width: limit ? `${pct}%` : "0%" }} />
        </div>
      </div>
      <div className="text-xs text-mute">
        <p>
          <span className="text-paper-dim">{m.month.sessions}</span> sessions · <span className="text-paper-dim">{m.month.preps}</span> preps
        </p>
        <p className="mt-0.5">${m.month.costUsd.toFixed(2)} this month</p>
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="secondary" onClick={onCopy}>
          <Copy className="h-3.5 w-3.5" /> Link
        </Button>
        {!owner && (
          <>
            <Button size="sm" variant="ghost" onClick={onToggle} aria-label={m.revoked ? "Resume access" : "Pause access"}>
              {m.revoked ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit member">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function limitValue(l: Limit) {
  return l === "none" ? null : Number(l);
}

function CreateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (m: MemberView) => void }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [minutes, setMinutes] = useState<Limit>("120");
  const [preps, setPreps] = useState<"5" | "10" | "25" | "none">("10");
  const [expiry, setExpiry] = useState<Expiry>("never");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const { member } = await api<{ member: MemberView }>("/api/admin/members", {
        method: "POST",
        body: JSON.stringify({
          name,
          note,
          minutesPerMonth: limitValue(minutes),
          prepsPerMonth: preps === "none" ? null : Number(preps),
          expiresInDays: expiry === "never" ? null : Number(expiry),
        }),
      });
      setName("");
      setNote("");
      onCreated(member);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Invite someone">
      <div className="space-y-4">
        <Field label="Their name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aarav" />
        </Field>
        <Field label="Note (only you see this)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. prepping for nursing interviews" />
        </Field>
        <Field label="Interview minutes per month">
          <Segmented<Limit>
            size="sm"
            value={minutes}
            onChange={setMinutes}
            options={[
              { value: "60", label: "60" },
              { value: "120", label: "120" },
              { value: "300", label: "300" },
              { value: "none", label: "No limit" },
            ]}
          />
        </Field>
        <Field label="Prep packs per month">
          <Segmented
            size="sm"
            value={preps}
            onChange={setPreps}
            options={[
              { value: "5", label: "5" },
              { value: "10", label: "10" },
              { value: "25", label: "25" },
              { value: "none", label: "No limit" },
            ]}
          />
        </Field>
        <Field label="Link expires">
          <Segmented<Expiry>
            size="sm"
            value={expiry}
            onChange={setExpiry}
            options={[
              { value: "never", label: "Never" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
            ]}
          />
        </Field>
        <Button variant="glow" className="w-full" loading={busy} disabled={!name.trim()} onClick={submit}>
          <KeyRound className="h-4 w-4" /> Create invite link
        </Button>
      </div>
    </Modal>
  );
}

function CreatedModal({ m, onClose }: { m: MemberView | null; onClose: () => void }) {
  const [copied, setCopied] = useState<"link" | "msg" | null>(null);
  if (!m) return null;
  const url = inviteUrl(m.token);
  const message = `Hey ${m.name.split(" ")[0]}! I set you up with InterviewIQ — an AI interviewer you can practice with out loud, and it shows you exactly how to improve. It's free for you, no sign-up. Just open this link (keep it private, it's your key): ${url}`;
  const doCopy = (what: "link" | "msg") => {
    void navigator.clipboard.writeText(what === "link" ? url : message);
    setCopied(what);
    setTimeout(() => setCopied(null), 1800);
  };
  return (
    <Modal open={!!m} onClose={onClose} title={`${m.name}'s invite is ready`}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 pl-4">
          <Link2 className="h-4 w-4 shrink-0 text-mute" />
          <p className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-paper-dim">{url}</p>
          <Button size="sm" onClick={() => doCopy("link")}>
            {copied === "link" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy
          </Button>
        </div>
        <div className="rounded-2xl border hairline bg-white/[0.02] p-4">
          <p className="text-xs text-mute">A message you can send</p>
          <p className="mt-2 text-sm leading-relaxed text-paper-dim">{message}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => doCopy("msg")}>
              {copied === "msg" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy message
            </Button>
          </div>
        </div>
        <p className="text-xs text-faint">Anyone with this link can use their minutes. You can pause it or issue a new link any time.</p>
      </div>
    </Modal>
  );
}

function EditModal({ m, onClose, onSaved }: { m: MemberView | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [minutes, setMinutes] = useState<string>("");
  const [preps, setPreps] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!m) return;
    setMinutes(m.limits.minutesPerMonth == null ? "" : String(m.limits.minutesPerMonth));
    setPreps(m.limits.prepsPerMonth == null ? "" : String(m.limits.prepsPerMonth));
    setConfirmDelete(false);
  }, [m]);
  if (!m) return null;
  const save = async () => {
    await api(`/api/admin/members/${m.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        minutesPerMonth: minutes.trim() === "" ? null : Number(minutes),
        prepsPerMonth: preps.trim() === "" ? null : Number(preps),
      }),
    });
    onSaved("Limits updated");
  };
  const rotate = async () => {
    await api(`/api/admin/members/${m.id}`, { method: "PATCH", body: JSON.stringify({ rotate: true }) });
    onSaved(`New link issued — the old one for ${m.name} no longer works`);
  };
  const remove = async () => {
    await api(`/api/admin/members/${m.id}`, { method: "DELETE" });
    onSaved(`${m.name} removed`);
  };
  return (
    <Modal open={!!m} onClose={onClose} title={m.name}>
      <AnimatePresence mode="wait">
        {!confirmDelete ? (
          <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Minutes / month" hint="Blank = no limit">
                <Input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} />
              </Field>
              <Field label="Prep packs / month" hint="Blank = no limit">
                <Input inputMode="numeric" value={preps} onChange={(e) => setPreps(e.target.value.replace(/\D/g, ""))} />
              </Field>
            </div>
            <div className="rounded-2xl border hairline p-4 text-sm text-mute">
              Lifetime: {Math.round(m.lifetime.minutes)} min · {m.lifetime.sessions} sessions · ${m.lifetime.costUsd.toFixed(2)}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="glow" onClick={save}>
                Save limits
              </Button>
              <Button variant="secondary" onClick={rotate}>
                <RefreshCw className="h-4 w-4" /> New link
              </Button>
              <Button variant="danger" className="ml-auto" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="del" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-sm text-mute">
              Remove {m.name}? Their link stops working immediately. Their practice history stays on their own device.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={remove}>
                Remove
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
