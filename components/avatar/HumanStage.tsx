"use client";

/**
 * Realistic 3D interviewers (TalkingHead + our MPFB cast).
 *
 * TalkingHead plays the interviewer's audio itself and lip-syncs it to the
 * per-character timings ElevenLabs sends, so lips match the actual words.
 * On top of that we layer the non-verbal behaviour of a real interviewer:
 * nodding while you talk, a thinking glance, mirroring a smile, and panel
 * members looking at whoever is speaking.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { TTS_SAMPLE_RATE, type InterviewLanguage, type InterviewerInfo, type Persona } from "@/types/interview";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Head = any;

export type StageMood = "idle" | "listening" | "thinking" | "speaking";
export type Reaction = "nod" | "smile" | "think" | "skeptical" | "warm" | "thumbsup";

export interface HumanStageHandle {
  /** All heads loaded. */
  ready(): boolean;
  begin(speaker: string): void;
  audio(buf: ArrayBuffer): void;
  align(speaker: string, chars: string[], starts: number[], durs: number[]): void;
  /** Server finished sending this utterance; `onDone` fires when it finishes playing. */
  end(): void;
  interrupt(): void;
  isSpeaking(): boolean;
  react(kind: Reaction, speaker?: string): void;
  /** Live output level 0..1 (for the UI). */
  level(): number;
}

interface Props {
  interviewers: InterviewerInfo[];
  activeSpeaker: string;
  mood: StageMood;
  persona: Persona;
  language: InterviewLanguage;
  /** Candidate's mic level 0..1 (drives listening nods). */
  getMicLevel?: () => number;
  /** Fired when an utterance has fully played out. */
  onDone: () => void;
  /** If streaming speech fails mid-utterance, audio is handed to the regular player instead. */
  onFallbackAudio?: (buf: ArrayBuffer) => void;
  onFallbackEnd?: () => void;
  onError?: (message: string) => void;
  /** All characters loaded and warmed up. */
  onReady?: () => void;
  className?: string;
}

const EMOJI: Record<Reaction, string> = {
  nod: "yes",
  smile: "🙂",
  think: "🤔",
  skeptical: "😏",
  warm: "😊",
  thumbsup: "👍",
};

const LIPSYNC: Partial<Record<InterviewLanguage, string>> = { en: "en", multi: "en", fr: "fr", de: "de" };

export const HumanStage = forwardRef<HumanStageHandle, Props>(function HumanStage(
  { interviewers, activeSpeaker, mood, persona, language, getMicLevel, onDone, onFallbackAudio, onFallbackEnd, onError, onReady, className },
  ref
) {
  const mounts = useRef<(HTMLDivElement | null)[]>([]);
  const heads = useRef<Map<string, Head>>(new Map());
  const [loaded, setLoaded] = useState(0);
  const [progress, setProgress] = useState(0);
  const current = useRef<{ speaker: string; head: Head; started: Promise<void> | null; queue: (() => void)[]; failed: boolean } | null>(null);
  const warmed = useRef<Set<string>>(new Set());
  const fallbackRef = useRef({ audio: onFallbackAudio, end: onFallbackEnd });
  fallbackRef.current = { audio: onFallbackAudio, end: onFallbackEnd };
  const speaking = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const micRef = useRef(getMicLevel);
  micRef.current = getMicLevel;

  const lipsyncLang = LIPSYNC[language] ?? "en";

  /* ── load heads ── */
  useEffect(() => {
    let cancelled = false;
    const created: Head[] = [];
    (async () => {
      try {
        const { TalkingHead } = await import("@met4citizen/talkinghead");
        let done = 0;
        await Promise.all(
          interviewers.map(async (iv, i) => {
            const el = mounts.current[i];
            if (!el) return;
            const head = new TalkingHead(el, {
              ttsEndpoint: null,
              lipsyncModules: [...new Set(["en", lipsyncLang])],
              lipsyncLang,
              cameraView: "head",
              cameraDistance: 0.7,
              cameraY: 0.1,
              cameraRotateEnable: false,
              cameraPanEnable: false,
              cameraZoomEnable: false,
              modelPixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
              modelFPS: 30,
              avatarMood: persona === "warm" ? "happy" : "neutral",
              avatarIdleEyeContact: 0.55,
              avatarSpeakingEyeContact: 0.75,
              avatarIdleHeadMove: 0.35,
              avatarSpeakingHeadMove: 0.55,
              // Soft key light from the side + cool rim, like a lit office video call.
              lightAmbientColor: 0xfff2e6,
              lightAmbientIntensity: 1.0,
              lightDirectColor: 0xfff0e0,
              lightDirectIntensity: 18,
              lightDirectPhi: 1.0,
              lightDirectTheta: 1.4,
              lightSpotIntensity: 7,
              lightSpotColor: 0xa9c2ff,
              lightSpotPhi: 0.15,
              lightSpotTheta: 4.2,
            });
            created.push(head);
            await head.showAvatar(
              {
                url: `/avatars/${iv.avatar}.glb`,
                body: iv.gender === "male" ? "M" : "F",
                avatarMood: persona === "warm" ? "happy" : "neutral",
                lipsyncLang,
              },
              (e: ProgressEvent) => {
                if (e.total) setProgress((p) => Math.max(p, e.loaded / e.total));
              }
            );
            if (cancelled) return;
            heads.current.set(iv.name, head);
            if (process.env.NODE_ENV !== "production") (window as unknown as { __iqHeads?: unknown }).__iqHeads = heads.current;
            // Warm up the streaming-speech pipeline now (correct sample rate + audio worklet),
            // so the first sentence never waits on it. Retries cover slow, busy devices.
            for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
              try {
                await head.streamStart({ sampleRate: TTS_SAMPLE_RATE, waitForAudioChunks: true });
                head.streamStop();
                warmed.current.add(iv.name);
                break;
              } catch {
                await new Promise((res) => setTimeout(res, 800));
              }
            }
            done++;
            setLoaded(done);
            if (done === interviewers.length) onReady?.();
          })
        );
      } catch (err) {
        console.warn("[human]", err);
        onError?.("The 3D interviewer couldn't load on this device — switching to the Aura view.");
      }
    })();
    return () => {
      cancelled = true;
      for (const h of created) {
        try {
          h.streamStop?.();
          h.stop?.();
        } catch {
          /* noop */
        }
      }
      heads.current.clear();
    };
    // Heads are created once per interview cast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewers.map((i) => i.avatar).join(",")]);

  /* ── behaviour loop: listening nods, thinking glance, panel gaze ── */
  useEffect(() => {
    let lastNod = 0;
    let thoughtAt = 0;
    const iv = setInterval(() => {
      const now = performance.now();
      const m = moodRef.current;
      const lead = heads.current.get(activeSpeaker) ?? [...heads.current.values()][0];
      if (!lead) return;
      if (m === "listening") {
        const level = micRef.current?.() ?? 0;
        // Nod now and then while the candidate is actually talking.
        if (level > 0.12 && now - lastNod > 5500 + Math.random() * 4500) {
          lastNod = now;
          playEmoji(lead, "yes");
        }
      } else if (m === "thinking") {
        if (now - thoughtAt > 6000) {
          thoughtAt = now;
          // People glance away briefly when they think.
          try {
            lead.lookAt?.(window.innerWidth * (Math.random() > 0.5 ? 0.15 : 0.85), window.innerHeight * 0.2, 900);
          } catch {
            /* noop */
          }
        }
      }
      // Panel: whoever isn't talking looks at whoever is.
      if (heads.current.size > 1) {
        const names = [...heads.current.keys()];
        const speakerIdx = names.indexOf(activeSpeaker);
        names.forEach((n, i) => {
          if (n === activeSpeaker || speakerIdx < 0) return;
          const h = heads.current.get(n);
          try {
            h?.lookAt?.(window.innerWidth * (speakerIdx < i ? 0.1 : 0.9), window.innerHeight * 0.4, 600);
          } catch {
            /* noop */
          }
        });
      }
    }, 700);
    return () => clearInterval(iv);
  }, [activeSpeaker]);

  useImperativeHandle(
    ref,
    (): HumanStageHandle => ({
      ready: () =>
        loaded === interviewers.length && heads.current.size === interviewers.length && warmed.current.size === interviewers.length,

      begin(speaker) {
        const head = heads.current.get(speaker) ?? [...heads.current.values()][0];
        if (!head) return;
        dbg("begin", { lipsync: Object.keys(head.lipsync ?? {}), ctx: head.audioCtx?.sampleRate, state: head.audioCtx?.state });
        void head.audioCtx?.resume?.()?.catch?.(() => {});
        const entry = { speaker, head, started: null as Promise<void> | null, queue: [] as (() => void)[], failed: false };
        current.current = entry;
        speaking.current = true;
        entry.started = Promise.resolve(
          head.streamStart(
            { sampleRate: TTS_SAMPLE_RATE, lipsyncType: "words", lipsyncLang, waitForAudioChunks: true },
            null,
            () => {
              // Only the most recent utterance may signal completion.
              if (current.current === entry) {
                speaking.current = false;
                doneRef.current();
              }
            }
          )
        )
          .then(() => {
            for (const fn of entry.queue.splice(0)) fn();
          })
          .catch((e) => {
            dbg("startFailed", String(e));
            // Streaming speech couldn't start: play this utterance through the regular player.
            entry.failed = true;
            speaking.current = false;
          });
      },

      audio(buf) {
        const c = current.current;
        dbg("audio");
        if (!c) return;
        const copy = buf.slice(0);
        const send = () => (c.failed ? fallbackRef.current.audio?.(copy) : c.head.streamAudio({ audio: buf }));
        if (c.queue.length || !c.started) c.queue.push(send);
        else c.started.finally(send);
      },

      align(_speaker, chars, starts, durs) {
        const c = current.current;
        if (!c) return;
        const w = toWords(chars, starts, durs);
        dbg("align", { words: w.words.slice(0, 4), t: w.wtimes.slice(0, 4) });
        if (!w.words.length) return;
        const send = () => !c.failed && c.head.streamAudio({ words: w.words, wtimes: w.wtimes, wdurations: w.wdurations });
        if (c.queue.length || !c.started) c.queue.push(send);
        else c.started.finally(send);
      },

      end() {
        const c = current.current;
        if (!c) return;
        const send = () => (c.failed ? fallbackRef.current.end?.() : c.head.streamNotifyEnd());
        if (c.started) c.started.finally(send);
        else c.queue.push(send);
      },

      interrupt() {
        const c = current.current;
        current.current = null;
        speaking.current = false;
        try {
          c?.head.streamInterrupt();
        } catch {
          /* noop */
        }
      },

      isSpeaking: () => speaking.current,

      react(kind, speaker) {
        const head = (speaker && heads.current.get(speaker)) || heads.current.get(activeSpeaker) || [...heads.current.values()][0];
        if (head) playEmoji(head, EMOJI[kind]);
      },

      level() {
        const head = current.current?.head;
        const an: AnalyserNode | undefined = head?.audioAnalyzerNode;
        if (!an || !speaking.current) return 0;
        const data = new Uint8Array(an.fftSize);
        an.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += ((data[i] - 128) / 128) ** 2;
        return Math.min(1, Math.sqrt(sum / data.length) * 2.4);
      },
    }),
    [loaded, interviewers.length, lipsyncLang, activeSpeaker]
  );

  const allLoaded = loaded === interviewers.length;

  return (
    <div className={cn("overflow-hidden", className ?? "relative")}>
      <OfficeBackdrop />
      <div className="absolute inset-0 flex">
        {interviewers.map((iv, i) => (
          <div
            key={iv.name}
            ref={(el) => {
              mounts.current[i] = el;
            }}
            className={cn(
              "relative h-full flex-1 transition-[filter,opacity] duration-700",
              interviewers.length > 1 && activeSpeaker && activeSpeaker !== iv.name && "opacity-90 brightness-90"
            )}
          />
        ))}
      </div>
      {!allLoaded && (
        <div className="absolute inset-x-0 bottom-20 flex flex-col items-center gap-2">
          <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-ember transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="text-xs text-mute">Your interviewer is taking their seat…</p>
        </div>
      )}
    </div>
  );
});

/** Dev-only counters for diagnosing the speech pipeline (window.__iqHuman). */
function dbg(kind: string, data?: unknown) {
  if (process.env.NODE_ENV === "production") return;
  const w = window as unknown as { __iqHuman?: Record<string, unknown> };
  const d = (w.__iqHuman ??= {});
  d[kind + "Count"] = ((d[kind + "Count"] as number) ?? 0) + 1;
  if (data !== undefined) d[kind] = data;
}

function playEmoji(head: Head, key: string) {
  try {
    const t = head.animEmojis?.[key];
    if (t) head.animQueue.push(head.animFactory(t));
  } catch {
    /* noop */
  }
}

/** ElevenLabs character timings → TalkingHead word timings. */
function toWords(chars: string[], starts: number[], durs: number[]) {
  const words: string[] = [];
  const wtimes: number[] = [];
  const wdurations: number[] = [];
  let cur = "";
  let start = 0;
  let end = 0;
  const flush = () => {
    if (cur.trim()) {
      words.push(cur.trim());
      wtimes.push(start);
      wdurations.push(Math.max(40, end - start));
    }
    cur = "";
  };
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (!cur) start = starts[i] ?? 0;
    cur += ch;
    end = (starts[i] ?? 0) + (durs[i] ?? 0);
  }
  flush();
  return { words, wtimes, wdurations };
}

/** A soft, out-of-focus office behind the interviewer — warm wall, window light, bokeh. */
function OfficeBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#2a2622_0%,#1f1c19_55%,#161412_100%)]" />
      <div className="absolute -left-[10%] top-[5%] h-[70%] w-[45%] rounded-[40%] bg-[radial-gradient(closest-side,rgba(255,236,210,0.22),transparent)] blur-2xl" />
      <div className="absolute right-[6%] top-[10%] h-[55%] w-[22%] rounded-xl bg-[linear-gradient(180deg,rgba(190,215,255,0.12),rgba(190,215,255,0.03))] blur-xl" />
      <div className="absolute left-[8%] top-[18%] h-24 w-24 rounded-full bg-[radial-gradient(closest-side,rgba(255,200,140,0.35),transparent)] blur-md" />
      <div className="absolute left-[22%] top-[30%] h-12 w-12 rounded-full bg-[radial-gradient(closest-side,rgba(255,220,170,0.3),transparent)] blur-sm" />
      <div className="absolute right-[18%] top-[22%] h-16 w-16 rounded-full bg-[radial-gradient(closest-side,rgba(170,200,255,0.25),transparent)] blur-md" />
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-[linear-gradient(0deg,rgba(10,9,8,0.85),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,transparent_40%,rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}
