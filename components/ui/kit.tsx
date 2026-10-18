"use client";

import Link from "next/link";
import { forwardRef, useEffect, useId, useState, type ComponentProps, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";

/* ───────────────────────────── Button ───────────────────────────── */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "glow";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-paper text-ink-900 hover:bg-white shadow-[0_8px_30px_-10px_rgba(255,255,255,0.35)]",
  glow: "text-ink-950 bg-[linear-gradient(110deg,#ffd6a5,#ffc56e_35%,#ff8a4c_75%,#ff6a5c)] shadow-[0_10px_40px_-10px_rgba(255,138,76,0.75)] hover:brightness-110",
  secondary: "glass text-paper hover:bg-white/[0.08]",
  ghost: "text-paper-dim hover:text-paper hover:bg-white/[0.06]",
  danger: "bg-bad/15 text-bad border border-bad/30 hover:bg-bad/25",
};
const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5 rounded-xl",
  md: "h-11 px-5 text-sm gap-2 rounded-2xl",
  lg: "h-14 px-7 text-[15px] gap-2.5 rounded-2xl",
};

interface ButtonProps extends ComponentProps<"button"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  href?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, href, className, children, disabled, ...rest },
  ref
) {
  const cls = cn(
    "relative inline-flex select-none items-center justify-center font-medium tracking-[-0.01em] transition-all duration-200 ease-out active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100",
    VARIANTS[variant],
    SIZES[size],
    className
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button ref={ref} className={cls} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

/* ───────────────────────────── Card ───────────────────────────── */

export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={cn("glass rounded-xl3 p-6", className)} {...rest}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-[11px] uppercase tracking-[0.22em] text-mute", className)}>{children}</p>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "ember" | "tide" | "iris" | "good" | "warn" | "bad";
  className?: string;
}) {
  const tones = {
    neutral: "bg-white/[0.06] text-paper-dim border-white/10",
    ember: "bg-ember/12 text-ember-soft border-ember/25",
    tide: "bg-tide/10 text-tide border-tide/25",
    iris: "bg-iris/10 text-iris border-iris/25",
    good: "bg-good/10 text-good border-good/25",
    warn: "bg-warn/10 text-warn border-warn/25",
    bad: "bg-bad/10 text-bad border-bad/25",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* ───────────────────────────── Fields ───────────────────────────── */

const fieldBase =
  "w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-[15px] text-paper placeholder:text-faint outline-none transition focus:border-ember/50 focus:bg-white/[0.05] focus:ring-4 focus:ring-ember/10";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label && <span className="mb-2 block text-[13px] font-medium text-paper-dim">{label}</span>}
      {children}
      {hint && <span className="mt-1.5 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(fieldBase, "h-12", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(function Textarea(
  { className, ...rest },
  ref
) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-28 resize-y py-3 leading-relaxed", className)} {...rest} />;
});

/* ───────────────────────────── Segmented ───────────────────────────── */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; hint?: string }[];
  className?: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      className={cn("relative flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex-1 whitespace-nowrap rounded-xl px-3 font-medium transition-colors",
              size === "sm" ? "h-8 text-[12.5px]" : "h-10 text-[13.5px]",
              active ? "text-ink-900" : "text-paper-dim hover:text-paper"
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-xl bg-paper"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── Toggle ───────────────────────────── */

export function Toggle({
  checked,
  onChange,
  label,
  description,
  icon,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left transition",
        checked ? "border-ember/30 bg-ember/[0.06]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
      )}
    >
      {icon && (
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
            checked ? "bg-ember/15 text-ember-soft" : "bg-white/[0.05] text-mute"
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-paper">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-snug text-mute">{description}</span>}
      </span>
      <span
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-ember" : "bg-white/15"
        )}
      >
        <motion.span
          className="absolute top-1 h-4 w-4 rounded-full bg-white shadow"
          animate={{ left: checked ? 20 : 4 }}
          transition={{ type: "spring", stiffness: 600, damping: 35 }}
        />
      </span>
    </button>
  );
}

/* ───────────────────────────── Modal ───────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal
            className={cn("glass relative w-full max-w-lg rounded-xl3 bg-ink-850/90 p-6", className)}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-mute hover:bg-white/10 hover:text-paper"
            >
              <X className="h-4 w-4" />
            </button>
            {title && <h2 className="mb-4 pr-8 text-lg font-semibold">{title}</h2>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ───────────────────────────── Misc ───────────────────────────── */

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative grid h-7 w-7 place-items-center">
        <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff1d6,#ff8a4c_45%,#7a3cff_100%)] shadow-[0_0_24px_-2px_rgba(255,138,76,0.7)]" />
        <span className="absolute inset-[5px] rounded-full bg-[radial-gradient(circle_at_40%_35%,rgba(255,255,255,0.9),transparent_60%)] opacity-60" />
      </span>
      {!compact && (
        <span className="text-[17px] font-semibold tracking-[-0.03em]">
          Interview<span className="text-ember-grad">IQ</span>
        </span>
      )}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-mute", className)} />;
}

export function FullScreenLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-4">
        <span className="relative h-12 w-12">
          <span className="absolute inset-0 animate-ping rounded-full bg-ember/20" />
          <span className="absolute inset-2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff1d6,#ff8a4c_45%,#7a3cff)]" />
        </span>
        <p className="shimmer-text text-sm">{label}</p>
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl3 border border-dashed border-white/10 px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.05] text-mute">{icon}</span>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-mute">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Tiny toast hook: `const [toast, show] = useToast()` then render `{toast}`. */
export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  const node = (
    <AnimatePresence>
      {msg && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full border border-white/10 bg-ink-700/95 px-5 py-2.5 text-sm shadow-2xl backdrop-blur"
          role="status"
        >
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
  return [node, setMsg];
}
