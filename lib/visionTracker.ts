"use client";

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { CvMetrics } from "@/types/interview";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/**
 * In-browser real-time facial metrics via MediaPipe FaceLandmarker.
 * Runs entirely on-device (no frames uploaded), throttled to new video frames,
 * and aggregates eye contact, blink rate, smiling, presence and head steadiness
 * across the whole interview — the measurable "model's perspective".
 */
export class VisionTracker {
  private landmarker: FaceLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private raf = 0;
  private running = false;
  private lastVideoTime = -1;
  private startTime = 0;

  // aggregates
  private frames = 0;
  private present = 0;
  private eyeContactFrames = 0;
  private smileFrames = 0;
  private blinkCount = 0;
  private blinking = false;
  private lastNoseX: number | null = null;
  private lastNoseY: number | null = null;
  private moveSum = 0;
  private moveSamples = 0;

  async init(): Promise<boolean> {
    try {
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: "VIDEO",
        numFaces: 1,
      });
      return true;
    } catch (err) {
      console.warn("[cv] MediaPipe init failed:", (err as Error).message);
      this.landmarker = null;
      return false;
    }
  }

  start(video: HTMLVideoElement) {
    if (!this.landmarker) return;
    this.video = video;
    this.running = true;
    this.startTime = performance.now();
    this.loop();
  }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const v = this.video;
    const lm = this.landmarker;
    if (!v || !lm || v.readyState < 2 || v.videoWidth === 0) return;
    if (v.currentTime === this.lastVideoTime) return; // only new frames
    this.lastVideoTime = v.currentTime;
    let res;
    try {
      res = lm.detectForVideo(v, performance.now());
    } catch {
      return;
    }
    this.process(res);
  };

  private process(res: ReturnType<FaceLandmarker["detectForVideo"]>) {
    this.frames++;
    const faces = res.faceLandmarks;
    if (!faces || faces.length === 0) return;
    this.present++;

    const cats = res.faceBlendshapes?.[0]?.categories ?? [];
    const score = (name: string) => {
      const c = cats.find((x) => x.categoryName === name);
      return c ? c.score : 0;
    };

    // Blink detection (rising-edge)
    const blink = Math.max(score("eyeBlinkLeft"), score("eyeBlinkRight"));
    if (blink > 0.5 && !this.blinking) {
      this.blinkCount++;
      this.blinking = true;
    } else if (blink < 0.3) {
      this.blinking = false;
    }

    // Smile
    const smile = (score("mouthSmileLeft") + score("mouthSmileRight")) / 2;
    if (smile > 0.3) this.smileFrames++;

    // Eye contact: gaze roughly centered (low look-away on all axes)
    const away = Math.max(
      score("eyeLookOutLeft"), score("eyeLookOutRight"),
      score("eyeLookInLeft"), score("eyeLookInRight"),
      score("eyeLookUpLeft"), score("eyeLookUpRight"),
      score("eyeLookDownLeft"), score("eyeLookDownRight")
    );
    if (away < 0.45) this.eyeContactFrames++;

    // Head steadiness from nose-tip (landmark 1) movement between frames
    const nose = faces[0][1];
    if (nose) {
      if (this.lastNoseX !== null && this.lastNoseY !== null) {
        const dx = nose.x - this.lastNoseX;
        const dy = nose.y - this.lastNoseY;
        this.moveSum += Math.sqrt(dx * dx + dy * dy);
        this.moveSamples++;
      }
      this.lastNoseX = nose.x;
      this.lastNoseY = nose.y;
    }
  }

  getMetrics(): CvMetrics {
    const present = Math.max(1, this.present);
    const frames = Math.max(1, this.frames);
    const elapsedMin = Math.max(0.1, (performance.now() - this.startTime) / 60000);
    const avgMove = this.moveSamples ? this.moveSum / this.moveSamples : 0;

    const presentPct = clamp((this.present / frames) * 100);
    const eyeContactPct = clamp((this.eyeContactFrames / present) * 100);
    const smilePct = clamp((this.smileFrames / present) * 100);
    const blinksPerMin = this.blinkCount / elapsedMin;
    // Normalized nose movement (~0..0.03 typical) → steadiness score.
    const headSteadiness = clamp(100 - avgMove * 3500);
    const engagement = clamp(
      eyeContactPct * 0.45 +
        presentPct * 0.2 +
        headSteadiness * 0.2 +
        Math.min(100, smilePct * 2) * 0.15
    );

    return {
      frames: this.frames,
      presentPct: Math.round(presentPct),
      eyeContactPct: Math.round(eyeContactPct),
      blinksPerMin: Math.round(blinksPerMin),
      smilePct: Math.round(smilePct),
      headSteadiness: Math.round(headSteadiness),
      engagement: Math.round(engagement),
    };
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    try {
      this.landmarker?.close();
    } catch {
      /* noop */
    }
    this.landmarker = null;
  }
}
