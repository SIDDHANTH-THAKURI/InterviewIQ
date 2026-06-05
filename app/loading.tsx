export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-line border-t-accent" />
        <p className="display text-lg font-semibold tracking-tight text-ink">
          Interview<span style={{ color: "var(--accent-ink)" }}>IQ</span>
        </p>
      </div>
    </main>
  );
}
