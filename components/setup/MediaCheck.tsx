"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Mic, Check, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { AudioVisualiser } from "@/components/interview/AudioVisualiser";
import { cn } from "@/lib/utils";

interface MediaCheckProps {
  onReadyChange: (ready: boolean) => void;
}

type Phase = "requesting" | "ready" | "error" | "unsupported";

export function MediaCheck({ onReadyChange }: MediaCheckProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>("requesting");
  const [error, setError] = useState<string>("");
  const [camOk, setCamOk] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const [level, setLevel] = useState(0);

  const ready = camOk && micOk;
  useEffect(() => onReadyChange(ready), [ready, onReadyChange]);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setPhase("requesting");
    setError("");
    setCamOk(false);
    setMicOk(false);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamOk(stream.getVideoTracks().length > 0);

      // Mic level meter
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      setMicOk(stream.getAudioTracks().length > 0);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        // Fast attack so any voice registers immediately; slow decay so the
        // bars don't snap back to zero between words.
        const raw = Math.min(1, rms * 12);
        setLevel((prev) => raw > prev ? raw * 0.8 + prev * 0.2 : prev * 0.82);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      setPhase("ready");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "Camera and microphone access was blocked. Allow access in your browser, then retry."
          : name === "NotFoundError"
            ? "No camera or microphone found. Connect one and retry."
            : (err as Error).message || "Could not access your camera and microphone."
      );
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    start();
    return teardown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
      {/* Webcam preview */}
      <div className="relative aspect-video overflow-hidden rounded-card border border-line bg-charcoal">
        <video
          ref={videoRef}
          muted
          playsInline
          className="h-full w-full -scale-x-100 object-cover"
        />
        {phase !== "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-charcoal text-cream/80">
            {phase === "requesting" && (
              <>
                <Loader2 className="h-7 w-7 animate-spin" />
                <p className="text-sm">Requesting camera &amp; mic…</p>
              </>
            )}
            {phase === "error" && (
              <div className="max-w-xs px-6 text-center">
                <AlertCircle className="mx-auto h-7 w-7 text-accent" />
                <p className="mt-3 text-sm">{error}</p>
                <button
                  onClick={start}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-cream/30 px-4 py-2 text-sm hover:bg-cream/10"
                >
                  <RefreshCw className="h-4 w-4" /> Retry
                </button>
              </div>
            )}
            {phase === "unsupported" && (
              <div className="max-w-xs px-6 text-center">
                <AlertCircle className="mx-auto h-7 w-7 text-accent" />
                <p className="mt-3 text-sm">
                  This browser can’t access a camera and microphone. Try a recent
                  desktop browser.
                </p>
              </div>
            )}
          </div>
        )}
        {phase === "ready" && (
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Preview
          </div>
        )}
      </div>

      {/* Status */}
      <div className="flex flex-col justify-between gap-6">
        <div className="space-y-3">
          <StatusRow icon={Camera} label="Camera" ok={camOk} />
          <StatusRow icon={Mic} label="Microphone" ok={micOk} />
        </div>

        <div className="rounded-card border border-line bg-paper p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="eyebrow text-muted">Mic level</span>
            <span className="text-xs text-muted">Say something</span>
          </div>
          <AudioVisualiser level={level} active={micOk} height={48} />
        </div>

        <p className="text-sm leading-relaxed text-muted">
          Once you begin, the interview runs entirely hands-free — the
          interviewer speaks, listens and watches. This is the last button
          you’ll press.
        </p>
      </div>
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  ok,
}: {
  icon: typeof Camera;
  label: string;
  ok: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-card border px-5 py-4 transition-colors",
        ok ? "border-line bg-paper" : "border-dashed border-line bg-paper/50"
      )}
    >
      <span className="flex items-center gap-3 font-medium">
        <Icon className="h-5 w-5 text-ink-soft" />
        {label}
      </span>
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
          ok ? "bg-ink text-cream" : "bg-line text-muted"
        )}
      >
        {ok ? <Check className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
      </span>
    </div>
  );
}
