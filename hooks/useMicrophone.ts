"use client";

import { useCallback, useRef, useState } from "react";

interface UseMicrophoneOptions {
  /** Called with each 16-bit PCM frame (mono, native rate LE) as an ArrayBuffer. */
  onPcm?: (chunk: ArrayBuffer) => void;
  /** Optional smoothed input level 0..1, for a visualiser. */
  onLevel?: (level: number) => void;
}

type AudioCtor = typeof AudioContext;

function getAudioContextCtor(): AudioCtor {
  return (window.AudioContext ||
    (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext) as AudioCtor;
}

export function useMicrophone({ onPcm, onLevel }: UseMicrophoneOptions = {}) {
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const levelRef = useRef(0);
  /** Actual capture sample rate, known after start(). */
  const sampleRateRef = useRef(48000);

  const start = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      streamRef.current = stream;

      const Ctx = getAudioContextCtor();
      // Use the device's native rate — we send that exact rate to Deepgram, so
      // the audio is never resampled (cleaner audio = better transcription).
      const ctx = new Ctx();
      ctxRef.current = ctx;
      sampleRateRef.current = Math.round(ctx.sampleRate);
      if (ctx.state === "suspended") await ctx.resume();

      await ctx.audioWorklet.addModule("/pcm-worklet.js");

      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "pcm-worklet", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      });
      nodeRef.current = node;

      node.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
        const buf = ev.data;
        onPcm?.(buf);
        if (onLevel) {
          const pcm = new Int16Array(buf);
          let sum = 0;
          for (let i = 0; i < pcm.length; i++) {
            const s = pcm[i] / 0x8000;
            sum += s * s;
          }
          const rms = Math.sqrt(sum / pcm.length);
          // smooth + gently expand so quiet speech still reads on the meter
          levelRef.current = levelRef.current * 0.6 + Math.min(1, rms * 3.2) * 0.4;
          onLevel(levelRef.current);
        }
      };

      // Pull the graph through a muted sink so process() runs without echo.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      source.connect(node);
      node.connect(mute);
      mute.connect(ctx.destination);

      setIsActive(true);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone permission denied."
          : (err as Error).message || "Could not start microphone.";
      setError(message);
      setIsActive(false);
    }
  }, [onPcm, onLevel]);

  const stop = useCallback(() => {
    nodeRef.current?.port.close();
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
    setIsActive(false);
    levelRef.current = 0;
  }, []);

  return { start, stop, isActive, error, sampleRateRef };
}
