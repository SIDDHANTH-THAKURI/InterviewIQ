"use client";

import { useCallback, useRef, useState } from "react";
import { getPlaybackContext } from "@/lib/audioBus";

/**
 * Plays the one-time welcome intro through ElevenLabs (via /api/intro-tts) and
 * exposes live amplitude + spectral mouth-shape so the SAME 3D avatar used in
 * the interview can lip-sync to it. Lines are pipelined: while one line plays,
 * the next is already being fetched, so there are no dead gaps.
 */
export interface IntroLine {
  text: string;
}

export function useIntroSpeech(apiKey: string) {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const stoppedRef = useRef(false);
  const [speaking, setSpeaking] = useState(false);

  const ensure = useCallback(() => {
    const ctx = getPlaybackContext();
    if (!analyserRef.current) {
      const gain = ctx.createGain();
      gain.gain.value = 1;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      gain.connect(analyser);
      analyser.connect(ctx.destination);
      gainRef.current = gain;
      analyserRef.current = analyser;
    }
    return ctx;
  }, []);

  const fetchLine = useCallback(
    async (text: string): Promise<AudioBuffer | null> => {
      try {
        const ctx = ensure();
        const res = await fetch("/api/intro-tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, apiKey }),
        });
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        if (arr.byteLength === 0) return null;
        return await ctx.decodeAudioData(arr);
      } catch {
        return null;
      }
    },
    [apiKey, ensure],
  );

  const playBuffer = useCallback(
    (buf: AudioBuffer): Promise<void> =>
      new Promise((resolve) => {
        const ctx = ensure();
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(gainRef.current!);
        srcRef.current = src;
        src.onended = () => resolve();
        try {
          src.start();
        } catch {
          resolve();
        }
      }),
    [ensure],
  );

  /** Resume the shared context (best-effort). Returns true if running. */
  const resume = useCallback(async (): Promise<boolean> => {
    const ctx = ensure();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* needs a user gesture */
      }
    }
    return ctx.state === "running";
  }, [ensure]);

  /**
   * Speak the whole script. Calls onLine(index) the instant each line's audio
   * begins, so captions land in sync. Resolves when finished or stopped.
   */
  const playScript = useCallback(
    async (
      lines: IntroLine[],
      onLine?: (index: number) => void,
    ): Promise<void> => {
      stoppedRef.current = false;
      ensure();
      await resume();

      // Pipeline: fetch line 0, then fetch each next while the current plays.
      let pending = fetchLine(lines[0]?.text ?? "");
      for (let i = 0; i < lines.length; i++) {
        if (stoppedRef.current) break;
        const buf = await pending;
        if (i + 1 < lines.length) pending = fetchLine(lines[i + 1].text);
        if (stoppedRef.current) break;

        onLine?.(i);
        if (buf) {
          setSpeaking(true);
          await playBuffer(buf);
          setSpeaking(false);
        } else {
          // TTS failed for this line — hold the caption on a readable timer.
          await new Promise((r) => setTimeout(r, Math.min(4200, 1100 + lines[i].text.length * 45)));
        }
        if (stoppedRef.current) break;
        await new Promise((r) => setTimeout(r, 320)); // breath between lines
      }
      setSpeaking(false);
    },
    [ensure, resume, fetchLine, playBuffer],
  );

  const stop = useCallback(() => {
    stoppedRef.current = true;
    try {
      if (srcRef.current) {
        srcRef.current.onended = null;
        srcRef.current.stop();
      }
    } catch {
      /* already stopped */
    }
    setSpeaking(false);
  }, []);

  const getAmplitude = useCallback((): number => {
    const analyser = analyserRef.current;
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / data.length) * 2.2);
  }, []);

  const getMouthShape = useCallback((): { open: number; wide: number } => {
    const analyser = analyserRef.current;
    if (!analyser) return { open: 0, wide: 0 };
    const n = analyser.frequencyBinCount;
    const freq = new Uint8Array(n);
    analyser.getByteFrequencyData(freq);
    const binHz = (getPlaybackContext().sampleRate ?? 44100) / 2 / n;
    let low = 0, lowN = 0, high = 0, highN = 0;
    for (let i = 0; i < n; i++) {
      const hz = i * binHz;
      if (hz < 1500) { low += freq[i]; lowN++; }
      else if (hz < 4500) { high += freq[i]; highN++; }
    }
    const lowAvg = lowN ? low / lowN / 255 : 0;
    const highAvg = highN ? high / highN / 255 : 0;
    return { open: Math.min(1, lowAvg * 2.8), wide: Math.min(1, highAvg * 3.2) };
  }, []);

  return { playScript, stop, resume, speaking, getAmplitude, getMouthShape };
}
