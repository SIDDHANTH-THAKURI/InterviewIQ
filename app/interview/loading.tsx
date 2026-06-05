export default function InterviewLoading() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-charcoal-deep">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
        <p className="text-sm text-cream/60">Entering the room…</p>
      </div>
    </main>
  );
}
