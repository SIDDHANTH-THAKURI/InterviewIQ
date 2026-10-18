"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Lock, ShieldCheck, XCircle } from "lucide-react";
import { AuraOrb } from "@/components/aura/AuraOrb";
import { Button, FullScreenLoader, Logo } from "@/components/ui/kit";
import { ApiError, fetchAccess, setPass } from "@/lib/client/api";
import { getProfile } from "@/lib/client/db";
import { useApp } from "@/lib/client/store";
import type { AccessInfo } from "@/types/interview";

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const bootstrap = useApp((s) => s.bootstrap);
  const [state, setState] = useState<
    { kind: "checking" } | { kind: "ok"; access: AccessInfo; owner: string } | { kind: "bad"; message: string }
  >({ kind: "checking" });
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    fetchAccess(decodeURIComponent(token))
      .then(({ access, ownerName }) => setState({ kind: "ok", access, owner: ownerName }))
      .catch((err) =>
        setState({
          kind: "bad",
          message: err instanceof ApiError ? err.message : "We couldn't reach the server. Try again in a moment.",
        })
      );
  }, [token]);

  const enter = async () => {
    setEntering(true);
    setPass(decodeURIComponent(token));
    await bootstrap(true);
    const profile = await getProfile();
    router.replace(profile ? "/home" : "/onboarding");
  };

  if (state.kind === "checking") return <FullScreenLoader label="Checking your invite…" />;

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-6">
      <div className="pointer-events-none absolute left-1/2 top-[30%] h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 opacity-90">
        <AuraOrb mood={state.kind === "ok" ? "speaking" : "thinking"} energy={0.3} scale={0.8} className="h-full w-full" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="glass relative mt-56 w-full max-w-md rounded-xl3 p-8 text-center"
      >
        <Logo className="justify-center" />
        {state.kind === "ok" ? (
          <>
            <h1 className="display mt-6 text-5xl">
              Welcome, <span className="italic text-ember-grad">{state.access.name.split(" ")[0]}</span>.
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-mute">
              {state.access.role === "admin" ? "This is your owner pass." : `${state.owner} invited you to practice with InterviewIQ.`} No
              account, no password — this link is your key, so keep it to yourself.
            </p>
            <ul className="mt-6 space-y-2.5 text-left text-sm text-paper-dim">
              <li className="flex gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-good" /> Your resume and answers stay in this browser.
              </li>
              {state.access.limits.minutesPerMonth != null && (
                <li className="flex gap-2.5">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ember-soft" />
                  {state.access.limits.minutesPerMonth} interview minutes each month, on the house.
                </li>
              )}
            </ul>
            <Button variant="glow" size="lg" className="mt-8 w-full" loading={entering} onClick={enter}>
              Let's begin <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <XCircle className="mx-auto mt-6 h-10 w-10 text-bad" />
            <h1 className="mt-4 text-2xl font-semibold">This link doesn't work</h1>
            <p className="mt-2 text-[15px] text-mute">{state.message}</p>
            <p className="mt-1 text-sm text-faint">Ask the person who invited you for a fresh link.</p>
            <Button href="/" variant="secondary" className="mt-8">
              Back home
            </Button>
          </>
        )}
      </motion.div>
    </main>
  );
}
