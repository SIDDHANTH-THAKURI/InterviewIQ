"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { BookOpenCheck, History, Home, KeyRound, Mic, Shield, UserRound } from "lucide-react";
import { Button, FullScreenLoader, Logo } from "@/components/ui/kit";
import { useApp } from "@/lib/client/store";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/practice", label: "Practice", icon: Mic },
  { href: "/prep", label: "Prep", icon: BookOpenCheck },
  { href: "/history", label: "History", icon: History },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, profile, access, deniedReason, bootstrap } = useApp();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (status === "ready" && !profile && pathname !== "/onboarding") router.replace("/onboarding");
  }, [status, profile, pathname, router]);

  if (status === "idle" || status === "loading") return <FullScreenLoader />;
  if (status === "no-pass" || status === "denied") return <Locked reason={deniedReason} />;
  if (!profile && pathname !== "/onboarding") return <FullScreenLoader />;
  if (pathname === "/onboarding") return <>{children}</>;

  const items = access?.role === "admin" ? [...NAV, { href: "/admin", label: "Admin", icon: Shield }] : NAV;
  const minutesLeft =
    access?.limits.minutesPerMonth != null ? Math.max(0, access.limits.minutesPerMonth - access.usage.minutes) : null;

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r hairline bg-ink-900/80 px-4 py-6 backdrop-blur-xl lg:flex">
        <Link href="/home" className="px-2">
          <Logo />
        </Link>
        <nav className="mt-10 flex flex-col gap-1">
          {items.map((it) => {
            const active = pathname === it.href || pathname.startsWith(it.href + "/");
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  "relative flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors",
                  active ? "text-paper" : "text-mute hover:bg-white/[0.04] hover:text-paper"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-xl border border-white/10 bg-white/[0.06]"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <it.icon className={cn("relative h-[18px] w-[18px]", active && "text-ember-soft")} />
                <span className="relative">{it.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-4">
          <Button href="/practice" variant="glow" className="w-full">
            <Mic className="h-4 w-4" /> Start practicing
          </Button>
          {minutesLeft !== null && access && (
            <div className="rounded-2xl border hairline bg-white/[0.02] p-4">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-mute">Minutes this month</span>
                <span className="font-medium text-paper-dim">{Math.floor(minutesLeft)} left</span>
              </div>
              <div className="mt-2.5 h-1.5 rounded-full bg-ember/15">
                <div
                  className="h-full rounded-full bg-ember"
                  style={{
                    width: `${Math.min(100, (access.usage.minutes / Math.max(1, access.limits.minutesPerMonth ?? 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b hairline bg-ink-900/80 px-5 py-3 backdrop-blur-xl lg:hidden">
        <Link href="/home">
          <Logo />
        </Link>
        <Button href="/practice" size="sm" variant="glow">
          <Mic className="h-3.5 w-3.5" /> Practice
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-28 pt-8 sm:px-8 lg:pb-16 lg:pt-12">{children}</main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-3 bottom-3 z-30 flex justify-around rounded-2xl border hairline bg-ink-850/90 px-2 py-1.5 backdrop-blur-xl lg:hidden">
        {items.slice(0, 5).map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10.5px] font-medium",
                active ? "text-paper" : "text-faint"
              )}
            >
              <it.icon className={cn("h-5 w-5", active && "text-ember-soft")} />
              {it.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Locked({ reason }: { reason?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="glass w-full max-w-md rounded-xl3 p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-ember/12 text-ember-soft">
          <KeyRound className="h-5 w-5" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">InterviewIQ is invite-only</h1>
        <p className="mt-2 text-[15px] text-mute">
          {reason || "Open the invite link you were sent on this device to get started."}
        </p>
        <div className="mt-7 flex justify-center gap-2">
          <Button href="/" variant="secondary">
            Back home
          </Button>
          <Button href="/admin" variant="ghost">
            Admin
          </Button>
        </div>
      </div>
    </main>
  );
}
