"use client";

/**
 * On-device presence awareness — what a real interviewer would notice on camera.
 *
 * Runs MediaPipe in the browser: face landmarks (presence, gaze, a second face,
 * expressions), hand gestures (raised hand, pointing) and a light object
 * detector (phones). Nothing is uploaded. Every signal must hold for a sensible
 * time before it counts, so glancing away for a second is simply ignored.
 *
 * Also produces the aggregate CvMetrics used in the report.
 */
import {
  FaceLandmarker,
  FilesetResolver,
  GestureRecognizer,
  ObjectDetector,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type { CvMetrics, PresenceEvent, PresenceKind } from "@/types/interview";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const FACE = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const GESTURE = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";
const OBJECTS = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite";

/** How long each signal must hold before it counts (ms), and the cooldown before it can fire again. */
const RULES: Record<Exclude<PresenceKind, "returned">, { hold: number; cooldown: number }> = {
  absent: { hold: 6000, cooldown: 20000 },
  looking_away: { hold: 10000, cooldown: 45000 },
  other_person: { hold: 3000, cooldown: 120000 },
  hand_raised: { hold: 800, cooldown: 15000 },
  pointing: { hold: 1600, cooldown: 60000 },
  phone: { hold: 2500, cooldown: 90000 },
  confused: { hold: 2500, cooldown: 45000 },
  smiling: { hold: 900, cooldown: 9000 },
};

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export interface PresenceOptions {
  /** Detect gestures/objects and emit events (awareness mode). Metrics are always computed. */
  events: boolean;
  onEvent?: (e: PresenceEvent) => void;
}

export class PresenceWatcher {
  private face: FaceLandmarker | null = null;
  private gestures: GestureRecognizer | null = null;
  private objects: ObjectDetector | null = null;
  private video: HTMLVideoElement | null = null;
  private raf = 0;
  private running = false;
  private lastVideoTime = -1;
  private frameNo = 0;
  private startedAt = 0;
  private pausedFor = 0;
  private pausedSince = 0;

  // signal start times (ms) and last fire times
  private since: Partial<Record<PresenceKind, number>> = {};
  private fired: Partial<Record<PresenceKind, number>> = {};
  private active: Partial<Record<PresenceKind, boolean>> = {};
  private absentSince = 0;
  private phoneHits: boolean[] = [];
  private lastObjectCheck = 0;

  // metrics
  private frames = 0;
  private present = 0;
  private eyeContactFrames = 0;
  private smileFrames = 0;
  private blinkCount = 0;
  private blinking = false;
  private lastNose: { x: number; y: number } | null = null;
  private moveSum = 0;
  private moveSamples = 0;

  /** Latest smile state, for the interviewer to mirror. */
  smiling = false;

  constructor(private opts: PresenceOptions) {}

  async init(): Promise<boolean> {
    try {
      const fileset = await FilesetResolver.forVisionTasks(WASM);
      this.face = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE, delegate: "GPU" },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: "VIDEO",
        numFaces: 2,
      });
      if (this.opts.events) {
        const [g, o] = await Promise.allSettled([
          GestureRecognizer.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: GESTURE, delegate: "GPU" },
            runningMode: "VIDEO",
            numHands: 2,
          }),
          ObjectDetector.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: OBJECTS, delegate: "GPU" },
            runningMode: "VIDEO",
            scoreThreshold: 0.45,
            categoryAllowlist: ["cell phone"],
            maxResults: 2,
          }),
        ]);
        this.gestures = g.status === "fulfilled" ? g.value : null;
        this.objects = o.status === "fulfilled" ? o.value : null;
      }
      return true;
    } catch (err) {
      console.warn("[presence] init failed:", (err as Error).message);
      return false;
    }
  }

  start(video: HTMLVideoElement) {
    if (!this.face) return;
    this.video = video;
    this.running = true;
    this.startedAt = performance.now();
    this.loop();
  }

  /** Pauses event detection (e.g. while the interview is paused). */
  setPaused(paused: boolean) {
    if (paused && !this.pausedSince) this.pausedSince = performance.now();
    if (!paused && this.pausedSince) {
      this.pausedFor += performance.now() - this.pausedSince;
      this.pausedSince = 0;
      this.since = {};
    }
  }

  private elapsedSec(now = performance.now()) {
    return Math.round((now - this.startedAt - this.pausedFor) / 1000);
  }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const v = this.video;
    if (!v || !this.face || v.readyState < 2 || v.videoWidth === 0) return;
    if (v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;
    const now = performance.now();
    this.frameNo++;
    let res: FaceLandmarkerResult;
    try {
      res = this.face.detectForVideo(v, now);
    } catch {
      return;
    }
    this.processFace(res, now);
    if (this.pausedSince || !this.opts.events) return;
    if (this.gestures && this.frameNo % 3 === 0) this.processHands(v, now, res);
    if (this.objects && now - this.lastObjectCheck > 1200) {
      this.lastObjectCheck = now;
      this.processObjects(v, now);
    }
  };

  /* ───────────────────────────── signals ───────────────────────────── */

  /** Feed a boolean signal; emits once it has held long enough (and isn't cooling down). */
  private signal(kind: Exclude<PresenceKind, "returned">, on: boolean, now: number) {
    const rule = RULES[kind];
    if (!on) {
      if (this.active[kind] && (kind === "looking_away" || kind === "absent")) {
        this.active[kind] = false;
      }
      this.since[kind] = undefined;
      return;
    }
    const start = this.since[kind] ?? (this.since[kind] = now);
    if (now - start < rule.hold) return;
    // Sustained states (still away, still absent) re-report after their cooldown,
    // so the interviewer can react once it's a good moment — not just once ever.
    if (this.active[kind] && now - (this.fired[kind] ?? 0) < rule.cooldown) return;
    if (now - (this.fired[kind] ?? -Infinity) < rule.cooldown) return;
    this.fired[kind] = now;
    this.active[kind] = true;
    this.emit({ kind, at: this.elapsedSec(now) });
    // Momentary signals re-arm on their own; sustained ones re-arm when they end.
    if (kind !== "looking_away" && kind !== "absent") this.active[kind] = false;
  }

  private emit(e: PresenceEvent) {
    if (this.pausedSince) return;
    if (e.kind === "smiling") this.smiling = true;
    this.opts.onEvent?.(e);
  }

  private processFace(res: FaceLandmarkerResult, now: number) {
    this.frames++;
    const faces = res.faceLandmarks ?? [];

    // Presence / absence (with a "welcome back" when they return)
    if (!faces.length) {
      if (!this.absentSince) this.absentSince = now;
      this.signal("absent", true, now);
      this.signal("looking_away", false, now);
      this.signal("other_person", false, now);
      this.smiling = false;
      return;
    }
    if (this.absentSince) {
      const away = now - this.absentSince;
      if (this.active.absent) this.emit({ kind: "returned", at: this.elapsedSec(now), durationSec: Math.round(away / 1000) });
      this.absentSince = 0;
    }
    this.signal("absent", false, now);
    this.present++;
    if (this.opts.events) this.signal("other_person", faces.length > 1, now);

    const cats = res.faceBlendshapes?.[0]?.categories ?? [];
    const s = (n: string) => cats.find((c) => c.categoryName === n)?.score ?? 0;

    // Blinks (rising edge)
    const blink = Math.max(s("eyeBlinkLeft"), s("eyeBlinkRight"));
    if (blink > 0.5 && !this.blinking) {
      this.blinkCount++;
      this.blinking = true;
    } else if (blink < 0.3) this.blinking = false;

    // Smile
    const smile = (s("mouthSmileLeft") + s("mouthSmileRight")) / 2;
    if (smile > 0.3) this.smileFrames++;
    if (smile < 0.25) this.smiling = false;
    this.signal("smiling", smile > 0.5, now);

    // Gaze: eyes + head yaw/pitch from the transformation matrix
    const away = Math.max(
      s("eyeLookOutLeft"), s("eyeLookOutRight"), s("eyeLookInLeft"), s("eyeLookInRight"),
      s("eyeLookUpLeft"), s("eyeLookUpRight"), s("eyeLookDownLeft"), s("eyeLookDownRight")
    );
    const m = res.facialTransformationMatrixes?.[0]?.data;
    const yaw = m ? Math.abs(Math.atan2(m[8], m[10])) : 0; // radians
    const pitch = m ? Math.abs(Math.asin(Math.max(-1, Math.min(1, -m[9])))) : 0;
    const looking = away < 0.45 && yaw < 0.42 && pitch < 0.38;
    if (looking) this.eyeContactFrames++;
    if (this.opts.events) this.signal("looking_away", !looking, now);

    // Confusion: furrowed brow + pressed / frowning mouth, held
    const brow = (s("browDownLeft") + s("browDownRight")) / 2;
    const mouth = Math.max((s("mouthFrownLeft") + s("mouthFrownRight")) / 2, (s("mouthPressLeft") + s("mouthPressRight")) / 2);
    if (this.opts.events) this.signal("confused", brow > 0.45 && mouth > 0.3 && smile < 0.2, now);

    // Head steadiness from nose tip movement
    const nose = faces[0][1];
    if (nose) {
      if (this.lastNose) {
        this.moveSum += Math.hypot(nose.x - this.lastNose.x, nose.y - this.lastNose.y);
        this.moveSamples++;
      }
      this.lastNose = { x: nose.x, y: nose.y };
    }
  }

  private processHands(v: HTMLVideoElement, now: number, face: FaceLandmarkerResult) {
    let res;
    try {
      res = this.gestures!.recognizeForVideo(v, now);
    } catch {
      return;
    }
    const noseY = face.faceLandmarks?.[0]?.[1]?.y ?? 0.45;
    let raised = false;
    let pointing = false;
    (res.landmarks ?? []).forEach((hand, i) => {
      const gesture = res.gestures?.[i]?.[0]?.categoryName;
      const wristY = hand[0]?.y ?? 1;
      const tipsY = Math.min(hand[8]?.y ?? 1, hand[12]?.y ?? 1);
      // A raised hand: open palm (or fingers up) held clearly above face level.
      if ((gesture === "Open_Palm" || gesture === "Pointing_Up" || gesture === "Victory") && wristY < noseY + 0.05 && tipsY < noseY - 0.1) {
        raised = true;
      }
      // Pointing at something: index extended, hand below face level.
      if (gesture === "Pointing_Up" && wristY > noseY + 0.1) pointing = true;
    });
    this.signal("hand_raised", raised, now);
    this.signal("pointing", pointing && !raised, now);
  }

  private processObjects(v: HTMLVideoElement, now: number) {
    let hit = false;
    try {
      const r = this.objects!.detectForVideo(v, now);
      hit = (r.detections ?? []).some((d) => d.categories?.[0]?.categoryName === "cell phone");
    } catch {
      return;
    }
    this.phoneHits.push(hit);
    if (this.phoneHits.length > 4) this.phoneHits.shift();
    const seen = this.phoneHits.filter(Boolean).length >= 3;
    this.signal("phone", seen, now);
  }

  /* ───────────────────────────── metrics ───────────────────────────── */

  getMetrics(): CvMetrics {
    const present = Math.max(1, this.present);
    const frames = Math.max(1, this.frames);
    const elapsedMin = Math.max(0.1, (performance.now() - this.startedAt - this.pausedFor) / 60000);
    const avgMove = this.moveSamples ? this.moveSum / this.moveSamples : 0;
    const presentPct = clamp((this.present / frames) * 100);
    const eyeContactPct = clamp((this.eyeContactFrames / present) * 100);
    const smilePct = clamp((this.smileFrames / present) * 100);
    const headSteadiness = clamp(100 - avgMove * 3500);
    const engagement = clamp(eyeContactPct * 0.45 + presentPct * 0.2 + headSteadiness * 0.2 + Math.min(100, smilePct * 2) * 0.15);
    return {
      frames: this.frames,
      presentPct: Math.round(presentPct),
      eyeContactPct: Math.round(eyeContactPct),
      blinksPerMin: Math.round(this.blinkCount / elapsedMin),
      smilePct: Math.round(smilePct),
      headSteadiness: Math.round(headSteadiness),
      engagement: Math.round(engagement),
    };
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const t of [this.face, this.gestures, this.objects]) {
      try {
        t?.close();
      } catch {
        /* noop */
      }
    }
    this.face = this.gestures = this.objects = null;
  }
}
