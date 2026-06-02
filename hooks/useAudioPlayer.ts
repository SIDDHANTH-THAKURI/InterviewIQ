"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TTS_SAMPLE_RATE } from "@/types/interview";
import { getPlaybackContext } from "@/lib/audioBus";

/**
 * Gapless PCM player for streamed ElevenLabs audio.
 *
 * Incoming 16-bit/24 kHz PCM chunks are decoded into AudioBuffers and chained
 * back-to-back on the AudioContext clock so there are no clicks between chunks.
 * An AnalyserNode sits inline so the avatar can read live amplitude for lip
 * sync. A soft synthesized "thinking" cue keeps the avatar from ever going
 * fully silent between turns.
 */
export function useAudioPlayer() {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextStartRef = useRef(0);
  const activeSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const cueRef = useRef<{ gain: GainNode; oscs: OscillatorNode[]; lfo: OscillatorNode } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // Synchronous playback state for the mic gate (state lags a frame).
  const isPlayingRef = useRef(false);
  const lastEndRef = useRef(0);

  const ensureCtx = useCallback(() => {
    if (!ctxRef.current) {
      // Reuse the shared context that was unlocked on the Begin click.
      const ctx = getPlaybackContext();
      const master = ctx.createGain();
      master.gain.value = 1;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      master.connect(analyser);
      analyser.connect(ctx.destination);
      ctxRef.current = ctx;
      masterRef.current = master;
      analyserRef.current = analyser;
      nextStartRef.current = ctx.currentTime;
    }
    return ctxRef.current;
  }, []);

  /** Resume the context (call after a user gesture / on entering the room). */
  const unlock = useCallback(async () => {
    const ctx = ensureCtx();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* noop */
      }
    }
  }, [ensureCtx]);

  const enqueue = useCallback(
    (buf: ArrayBuffer) => {
      const ctx = ensureCtx();
      const master = masterRef.current!;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});

      const pcm = new Int16Array(buf);
      if (pcm.length === 0) return;
      const f32 = new Float32Array(pcm.length);
      for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 0x8000;

      const audioBuf = ctx.createBuffer(1, f32.length, TTS_SAMPLE_RATE);
      audioBuf.copyToChannel(f32, 0);

      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(master);

      // Schedule strictly after whatever is already queued, with a small lead.
      const now = ctx.currentTime;
      const startAt = Math.max(now + 0.05, nextStartRef.current);
      src.start(startAt);
      nextStartRef.current = startAt + audioBuf.duration;

      activeSources.current.add(src);
      if (activeSources.current.size === 1) {
        isPlayingRef.current = true;
        setIsPlaying(true);
      }
      src.onended = () => {
        activeSources.current.delete(src);
        if (activeSources.current.size === 0) {
          isPlayingRef.current = false;
          lastEndRef.current = performance.now();
          setIsPlaying(false);
        }
      };
    },
    [ensureCtx]
  );

  /** Stop everything currently scheduled (e.g. on barge-in or teardown). */
  const reset = useCallback(() => {
    activeSources.current.forEach((s) => {
      try {
        s.onended = null;
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    activeSources.current.clear();
    if (ctxRef.current) nextStartRef.current = ctxRef.current.currentTime;
    isPlayingRef.current = false;
    lastEndRef.current = performance.now();
    setIsPlaying(false);
  }, []);

  /**
   * True while the interviewer's voice is actually audible (plus a short tail
   * guard for reverb). The mic is gated on this so the AI never hears itself.
   */
  const isSpeaking = useCallback((guardMs = 450): boolean => {
    return isPlayingRef.current || performance.now() - lastEndRef.current < guardMs;
  }, []);

  /** Live amplitude 0..1 from the analyser (drives the avatar jaw). */
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

  /**
   * Spectral mouth shape for richer lip sync: `open` (jaw drop, from overall
   * loudness) and `wide` (spread, from high-frequency / sibilant energy).
   */
  const getMouthShape = useCallback((): { open: number; wide: number } => {
    const analyser = analyserRef.current;
    const ctx = ctxRef.current;
    if (!analyser) return { open: 0, wide: 0 };
    const n = analyser.frequencyBinCount;
    const freq = new Uint8Array(n);
    analyser.getByteFrequencyData(freq);
    const binHz = (ctx?.sampleRate ?? TTS_SAMPLE_RATE) / 2 / n;
    let low = 0, lowN = 0, high = 0, highN = 0;
    for (let i = 0; i < n; i++) {
      const hz = i * binHz;
      if (hz < 1500) { low += freq[i]; lowN++; }
      else if (hz < 4500) { high += freq[i]; highN++; }
    }
    const lowAvg = lowN ? low / lowN / 255 : 0;
    const highAvg = highN ? high / highN / 255 : 0;
    return {
      open: Math.min(1, lowAvg * 2.8),
      wide: Math.min(1, highAvg * 3.2),
    };
  }, []);

  /** Start a soft, breathy two-tone hum while the AI is "thinking". */
  const startCue = useCallback(() => {
    const ctx = ensureCtx();
    if (cueRef.current) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(masterRef.current!);

    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = 116;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = 174;
    o2.detune.value = 4;

    // Slow tremolo so it reads as a breath rather than a tone.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    o1.connect(gain);
    o2.connect(gain);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.03, t + 0.4);
    o1.start();
    o2.start();
    lfo.start();
    cueRef.current = { gain, oscs: [o1, o2], lfo };
  }, [ensureCtx]);

  const stopCue = useCallback(() => {
    const cue = cueRef.current;
    const ctx = ctxRef.current;
    if (!cue || !ctx) return;
    const t = ctx.currentTime;
    cue.gain.gain.cancelScheduledValues(t);
    cue.gain.gain.setValueAtTime(cue.gain.gain.value, t);
    cue.gain.gain.linearRampToValueAtTime(0, t + 0.25);
    const { oscs, lfo } = cue;
    setTimeout(() => {
      try {
        oscs.forEach((o) => o.stop());
        lfo.stop();
      } catch {
        /* noop */
      }
    }, 300);
    cueRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      reset();
      stopCue();
      // The playback context is shared app-wide — never close it here. Just
      // detach this instance's nodes.
      try {
        masterRef.current?.disconnect();
        analyserRef.current?.disconnect();
      } catch {
        /* noop */
      }
      ctxRef.current = null;
      masterRef.current = null;
      analyserRef.current = null;
    };
  }, [reset, stopCue]);

  return {
    enqueue,
    reset,
    unlock,
    getAmplitude,
    getMouthShape,
    isSpeaking,
    analyserRef,
    startCue,
    stopCue,
    isPlaying,
  };
}
