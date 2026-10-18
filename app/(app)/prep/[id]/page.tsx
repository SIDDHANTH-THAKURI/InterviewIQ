"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Circle,
  ListChecks,
  MessageCircleQuestion,
  Mic,
  Sparkles,
  Star,
  Target,
  Trash2,
  Trophy,
} from "lucide-react";
import { Badge, Button, Card, Eyebrow, FullScreenLoader, Modal, Segmented } from "@/components/ui/kit";
import { deletePrep, getPrep, putPrep, type PrepRecord } from "@/lib/client/db";
import { cn } from "@/lib/cn";
import type { PrepQuestion } from "@/types/interview";

type Tab = "overview" | "questions" | "stories" | "ask" | "dayof";
const EASE = [0.16, 1, 0.3, 1] as const;

export default function PrepDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [rec, setRec] = useState<PrepRecord | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("overview");
  const [cat, setCat] = useState("All");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [checked, setChecked] = useState<number[]>([]);

  useEffect(() => {
    void getPrep(id).then((r) => setRec(r ?? null));
    try {
      setChecked(JSON.parse(localStorage.getItem(`prep-check-${id}`) || "[]"));
    } catch {
      /* noop */
    }
  }, [id]);

  const cats = useMemo(() => ["All", ...new Set(rec?.pack.questions.map((q) => q.category) ?? [])], [rec]);

  if (rec === undefined) return <FullScreenLoader />;
  if (rec === null)
    return (
      <div className="py-24 text-center">
        <p className="text-lg font-medium">This prep pack isn't on this device.</p>
        <Button href="/prep" className="mt-6">
          Back to prep
        </Button>
      </div>
    );

  const { pack } = rec;
  const practiced = new Set(rec.practiced ?? []);

  const togglePracticed = async (i: number) => {
    const next = practiced.has(i) ? [...practiced].filter((x) => x !== i) : [...practiced, i];
    const r = { ...rec, practiced: next };
    setRec(r);
    await putPrep(r);
  };

  const practiceQuestion = (q: PrepQuestion) => {
    const focus = `Open with this exact question, then ask natural follow-ups on the same topic: "${q.question}"`;
    router.push(`/practice?prep=${rec.id}&format=drill&focus=${encodeURIComponent(focus)}`);
  };

  const toggleCheck = (i: number) => {
    const next = checked.includes(i) ? checked.filter((x) => x !== i) : [...checked, i];
    setChecked(next);
    localStorage.setItem(`prep-check-${id}`, JSON.stringify(next));
  };

  const qs = pack.questions.map((q, i) => ({ q, i })).filter(({ q }) => cat === "All" || q.category === cat);

  return (
    <div className="space-y-6">
      <section className="glass relative overflow-hidden rounded-xl3 p-7 sm:p-10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-iris/15 blur-3xl" />
        <div className="relative">
          <Eyebrow>Prep pack</Eyebrow>
          <h1 className="display mt-3 text-[clamp(2.2rem,4.6vw,3.5rem)]">
            {pack.role}
            {rec.company && <span className="italic text-ember-grad"> · {rec.company}</span>}
          </h1>
          <p className="mt-4 max-w-3xl text-[15.5px] leading-relaxed text-paper-dim">{pack.snapshot}</p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button variant="glow" href={`/practice?prep=${rec.id}&format=full`}>
              <Mic className="h-4 w-4" /> Mock interview with this pack
            </Button>
            <Badge tone="neutral">
              {practiced.size}/{pack.questions.length} questions practiced
            </Badge>
            <button onClick={() => setConfirmDelete(true)} className="ml-auto rounded-lg p-2 text-faint hover:bg-bad/10 hover:text-bad" aria-label="Delete pack">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-6 h-1.5 max-w-md overflow-hidden rounded-full bg-good/12">
            <motion.div className="h-full rounded-full bg-good" animate={{ width: `${(practiced.size / Math.max(1, pack.questions.length)) * 100}%` }} transition={{ duration: 0.8, ease: EASE }} />
          </div>
        </div>
      </section>

      <div className="overflow-x-auto">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          className="min-w-max"
          options={[
            { value: "overview", label: "Overview" },
            { value: "questions", label: `Questions · ${pack.questions.length}` },
            { value: "stories", label: `Stories · ${pack.stories.length}` },
            { value: "ask", label: "Ask them" },
            { value: "dayof", label: "Day of" },
          ]}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35, ease: EASE }}>
          {tab === "overview" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <ListCard icon={<Target className="h-4 w-4 text-ember-soft" />} title="What they're really screening for" items={pack.whatTheyWant} />
              <ListCard icon={<Trophy className="h-4 w-4 text-good" />} title="Your edge" items={pack.yourEdge} />
              <Card className="lg:col-span-2">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                  <AlertTriangle className="h-4 w-4 text-warn" /> Concerns to get ahead of
                </h2>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {pack.gaps.map((g, i) => (
                    <div key={i} className="rounded-2xl border hairline bg-white/[0.02] p-4">
                      <p className="font-medium">{g.gap}</p>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-mute">{g.howToAddress}</p>
                    </div>
                  ))}
                </div>
              </Card>
              {pack.companyNotes?.length ? (
                <ListCard className="lg:col-span-2" icon={<Building2 className="h-4 w-4 text-tide" />} title={`About ${rec.company ?? "the company"}`} items={pack.companyNotes} />
              ) : null}
            </div>
          )}

          {tab === "questions" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCat(c)}
                    className={cn("rounded-full border px-3.5 py-1.5 text-[13px] transition", cat === c ? "border-ember/40 bg-ember/10 text-paper" : "border-white/10 text-mute hover:text-paper")}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {qs.map(({ q, i }) => (
                <QuestionCard key={i} q={q} n={i + 1} done={practiced.has(i)} onToggle={() => togglePracticed(i)} onPractice={() => practiceQuestion(q)} />
              ))}
            </div>
          )}

          {tab === "stories" && (
            <div className="grid gap-4 md:grid-cols-2">
              {pack.stories.map((s, i) => (
                <Card key={i}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="flex items-center gap-2 font-semibold">
                      <Star className="h-4 w-4 text-gold" /> {s.title}
                    </h3>
                  </div>
                  <dl className="mt-4 space-y-3 text-[14px]">
                    {(
                      [
                        ["Situation", s.situation],
                        ["Task", s.task],
                        ["Action", s.action],
                        ["Result", s.result],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[5.5rem_1fr] gap-3">
                        <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">{k}</dt>
                        <dd className="leading-relaxed text-paper-dim">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {s.goodFor.map((g) => (
                      <Badge key={g} tone="iris">
                        {g}
                      </Badge>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {tab === "ask" && (
            <ListCard icon={<MessageCircleQuestion className="h-4 w-4 text-tide" />} title="Smart questions to ask them" items={pack.questionsToAsk} numbered />
          )}

          {tab === "dayof" && (
            <Card>
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <ListChecks className="h-4 w-4 text-good" /> Day-of checklist
              </h2>
              <div className="mt-5 space-y-2">
                {pack.dayOfChecklist.map((item, i) => {
                  const on = checked.includes(i);
                  return (
                    <button key={i} onClick={() => toggleCheck(i)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.03]">
                      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border transition", on ? "border-good bg-good text-ink-900" : "border-white/20")}>
                        {on && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className={cn("text-[14.5px] transition", on ? "text-faint line-through" : "text-paper-dim")}>{item}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this prep pack?">
        <p className="-mt-1 text-sm text-mute">It'll be removed from this device.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await deletePrep(rec.id);
              router.replace("/prep");
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function ListCard({
  icon,
  title,
  items,
  numbered,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  numbered?: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        {icon} {title}
      </h2>
      <ul className="mt-5 space-y-3">
        {items.map((it, i) => (
          <li key={i} className="flex gap-3 text-[14.5px] leading-relaxed text-paper-dim">
            {numbered ? <span className="font-mono text-xs leading-6 text-faint">{String(i + 1).padStart(2, "0")}</span> : <Circle className="mt-2 h-1.5 w-1.5 shrink-0 fill-current text-faint" />}
            {it}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function QuestionCard({
  q,
  n,
  done,
  onToggle,
  onPractice,
}: {
  q: PrepQuestion;
  n: number;
  done: boolean;
  onToggle: () => void;
  onPractice: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("glass overflow-hidden rounded-2xl", done && "border-good/20")}>
      <div className="flex items-center gap-3 px-5 py-4">
        <button
          onClick={onToggle}
          aria-label={done ? "Mark as not practiced" : "Mark as practiced"}
          className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border transition", done ? "border-good bg-good text-ink-900" : "border-white/20 hover:border-white/40")}
        >
          {done && <Check className="h-3.5 w-3.5" />}
        </button>
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="font-mono text-xs text-faint">{String(n).padStart(2, "0")}</span>
          <span className="min-w-0 flex-1 text-[15px] font-medium">{q.question}</span>
          <Badge className="hidden sm:inline-flex">{q.category}</Badge>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-mute transition", open && "rotate-180")} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-4 border-t hairline px-5 pb-5 pt-4">
              <p className="text-[14px] text-mute">
                <span className="text-paper-dim">Why they ask: </span>
                {q.whyTheyAsk}
              </p>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-faint">Answer outline</p>
                <ol className="mt-2 space-y-1.5">
                  {q.answerOutline.map((b, i) => (
                    <li key={i} className="flex gap-2.5 text-[14px] text-paper-dim">
                      <span className="text-ember-soft">{i + 1}.</span> {b}
                    </li>
                  ))}
                </ol>
              </div>
              {q.useStory && (
                <p className="flex items-center gap-2 text-[13.5px] text-paper-dim">
                  <Star className="h-3.5 w-3.5 text-gold" /> Use your story: <b className="font-medium">{q.useStory}</b>
                </p>
              )}
              <Button size="sm" variant="secondary" onClick={onPractice}>
                <Sparkles className="h-3.5 w-3.5" /> Practice this out loud <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
