"use client";

import { useEffect, useMemo, useState } from "react";
import { History, Mic, Trash2 } from "lucide-react";
import { SessionRow } from "@/components/SessionRow";
import { Button, EmptyState, Eyebrow, Modal, Segmented } from "@/components/ui/kit";
import { deleteSession, listSessions, type SessionRecord } from "@/lib/client/db";

type Filter = "all" | "scored" | "unfinished";

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [toDelete, setToDelete] = useState<SessionRecord | null>(null);

  const load = () => void listSessions().then(setSessions);
  useEffect(load, []);

  const shown = useMemo(() => {
    const s = sessions ?? [];
    if (filter === "scored") return s.filter((x) => x.status === "complete");
    if (filter === "unfinished") return s.filter((x) => x.status !== "complete");
    return s;
  }, [sessions, filter]);

  // Group by month
  const groups = useMemo(() => {
    const m = new Map<string, SessionRecord[]>();
    for (const s of shown) {
      const k = new Date(s.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [shown]);

  return (
    <div>
      <Eyebrow>History</Eyebrow>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-[clamp(2.4rem,5vw,3.75rem)]">
          Every rep, <span className="italic text-ember-grad">counted</span>.
        </h1>
        <Segmented<Filter>
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "scored", label: "Scored" },
            { value: "unfinished", label: "Unfinished" },
          ]}
        />
      </div>

      <div className="mt-10 space-y-10">
        {sessions && !shown.length && (
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title="Nothing here yet"
            body="Finish a session and its report will live here — on this device only."
            action={
              <Button href="/practice" variant="glow">
                <Mic className="h-4 w-4" /> Start practicing
              </Button>
            }
          />
        )}
        {groups.map(([month, list]) => (
          <section key={month}>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-faint">{month}</p>
            <div className="space-y-2">
              {list.map((s) => (
                <div key={s.id} className="group relative">
                  <SessionRow s={s} />
                  <button
                    onClick={() => setToDelete(s)}
                    aria-label="Delete session"
                    className="absolute right-12 top-1/2 hidden -translate-y-1/2 rounded-lg p-2 text-faint hover:bg-bad/10 hover:text-bad group-hover:block"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Delete this session?">
        <p className="-mt-1 text-sm text-mute">Its transcript and report will be removed from this device. This can't be undone.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setToDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (toDelete) await deleteSession(toDelete.id);
              setToDelete(null);
              load();
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
