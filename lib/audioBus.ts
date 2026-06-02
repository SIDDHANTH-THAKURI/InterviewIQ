"use client";

/**
 * A single shared playback AudioContext.
 *
 * Browsers only let audio start after a user gesture. The last gesture in the
 * flow is the "Begin Interview" click on /setup — so we create AND resume this
 * context there. Because Next.js navigates client-side (same document), the
 * context survives into /interview already running, guaranteeing the
 * interviewer's voice is audible without the user ever clicking in the room.
 */

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function ctor(): AudioCtor {
  return (window.AudioContext ||
    (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext) as AudioCtor;
}

export function getPlaybackContext(): AudioContext {
  if (!ctx) ctx = new (ctor())();
  return ctx;
}

/** Create + resume the shared context. Call from a real user gesture. */
export async function unlockPlayback(): Promise<void> {
  const c = getPlaybackContext();
  try {
    if (c.state === "suspended") await c.resume();
    // A 1-sample silent blip fully unlocks audio on stricter engines (iOS).
    const buf = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* best effort */
  }
}
