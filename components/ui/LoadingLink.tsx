"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface LoadingLinkProps {
  href: string;
  children: ReactNode;
  /** Text shown beside the spinner while the next page loads. */
  loadingLabel?: string;
  className?: string;
  /** Prefetch the route on mount so navigation is as fast as possible. */
  prefetch?: boolean;
  spinnerClassName?: string;
}

/**
 * A link that turns into a tasteful loading state the instant it's clicked.
 * Navigation in Next.js can stall briefly (first compile in dev, chunk fetch in
 * prod) — this gives immediate, polished feedback instead of a dead click.
 */
export function LoadingLink({
  href,
  children,
  loadingLabel = "Loading…",
  className,
  prefetch = true,
  spinnerClassName = "h-5 w-5",
}: LoadingLinkProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (prefetch) {
      try {
        router.prefetch(href);
      } catch {
        /* prefetch is best-effort */
      }
    }
  }, [href, prefetch, router]);

  const go = () => {
    if (loading) return;
    setLoading(true);
    router.push(href);
  };

  return (
    <button
      type="button"
      onClick={go}
      disabled={loading}
      aria-busy={loading}
      className={className}
    >
      {loading ? (
        <>
          <Loader2 className={`${spinnerClassName} animate-spin`} />
          {loadingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
