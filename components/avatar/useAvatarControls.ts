import * as THREE from "three";
import type { AvatarParts } from "./avatarLoader";

export type AvatarState = "idle" | "thinking" | "speaking" | "listening";

export interface AvatarUpdateInput {
  /** Live audio amplitude 0..1 (drives head/brow accents while speaking). */
  amplitude: number;
  /** Jaw-open amount 0..1 from spectral analysis (drives the mouth). */
  open?: number;
  /** Mouth spread 0..1 from high-frequency energy. */
  wide?: number;
  state: AvatarState;
}

export interface AvatarAnimator {
  update: (dt: number, input: AvatarUpdateInput) => void;
}

const { damp } = THREE.MathUtils;

/**
 * Stateful, frame-rate-independent animator for the stylized avatar.
 * All motion is procedural — idle breathing + blinks + saccades always run, and
 * the conversation state layers tilt/lean/nod/lip-sync on top.
 */
export function createAvatarAnimator(parts: AvatarParts): AvatarAnimator {
  const { root, head, leftEye, rightEye, leftBrow, rightBrow, mouth, torso } = parts;

  const baseTorsoY = torso.position.y;
  const baseTorsoScaleY = torso.scale.y;
  const baseHeadY = head.position.y;
  // Capture the head's rest rotation so tilt/turn/nod are applied RELATIVE to it
  // (a rigged GLB head bone has a non-zero rest pose; primitives are at 0).
  const baseHeadRotX = head.rotation.x;
  const baseHeadRotY = head.rotation.y;
  const baseHeadRotZ = head.rotation.z;
  const baseBrowY = leftBrow.position.y;
  const baseMouthY = mouth.scale.y;
  const baseMouthX = mouth.scale.x;

  let time = 0;
  let blinkTimer = 1.5 + Math.random() * 3;
  let blinking = false;
  let blinkT = 0;
  let nodTimer = 2 + Math.random() * 3;
  let nodding = false;
  let nodT = 0;
  let saccadeTimer = 1 + Math.random() * 2;
  let saccadeTurn = 0;
  let mouthOpen = 0;

  let mouthWide = 0;

  return {
    update(dt, { amplitude, open = amplitude, wide = 0, state }) {
      dt = Math.min(dt, 0.05);
      time += dt;

      /* Always-on life: breathing + bob */
      const breath = Math.sin(time * 1.3);
      torso.position.y = baseTorsoY + breath * 0.012;
      torso.scale.y = baseTorsoScaleY * (1 + (breath * 0.5 + 0.5) * 0.02);
      head.position.y = baseHeadY + breath * 0.01;

      /* Idle sway */
      let targetTurn = Math.sin(time * 0.45) * 0.05 + saccadeTurn;
      let targetTilt = Math.sin(time * 0.32) * 0.03;
      let targetPitch = 0;
      let targetBrow = 0.05;
      let targetLean = 0;
      let targetRootPitch = 0;

      /* Blink (set directly for a crisp snap) */
      blinkTimer -= dt;
      if (!blinking && blinkTimer <= 0) {
        blinking = true;
        blinkT = 0;
      }
      let eyeScaleY = 1;
      if (blinking) {
        blinkT += dt;
        const p = blinkT / 0.16;
        if (p >= 1) {
          blinking = false;
          blinkTimer = 3 + Math.random() * 3;
        } else {
          eyeScaleY = 1 - Math.sin(Math.min(p, 1) * Math.PI) * 0.92;
        }
      }

      /* Saccades — tiny random darts so the gaze never feels frozen */
      saccadeTimer -= dt;
      if (saccadeTimer <= 0) {
        saccadeTurn = (Math.random() - 0.5) * 0.06;
        saccadeTimer = 1.2 + Math.random() * 2.5;
      }

      switch (state) {
        case "thinking":
          targetTilt += 0.16;
          targetTurn += 0.14;
          targetPitch -= 0.05;
          targetBrow = 0.6;
          break;
        case "listening": {
          targetBrow = 0.3;
          targetPitch += 0.04;
          targetLean = 0.06;
          targetRootPitch = 0.04;
          nodTimer -= dt;
          if (!nodding && nodTimer <= 0) {
            nodding = true;
            nodT = 0;
          }
          if (nodding) {
            nodT += dt;
            const np = nodT / 0.9;
            if (np >= 1) {
              nodding = false;
              nodTimer = 2 + Math.random() * 3;
            } else {
              targetPitch += Math.sin(np * Math.PI) * 0.1;
            }
          }
          break;
        }
        case "speaking":
          targetTurn += Math.sin(time * 2.1) * 0.02;
          targetPitch += Math.sin(time * 1.7) * 0.012;
          targetBrow = 0.15 + amplitude * 0.4;
          break;
        default:
          break;
      }

      head.rotation.z = damp(head.rotation.z, baseHeadRotZ + targetTilt, 5, dt);
      head.rotation.y = damp(head.rotation.y, baseHeadRotY + targetTurn, 4.5, dt);
      head.rotation.x = damp(head.rotation.x, baseHeadRotX + targetPitch, 6, dt);
      root.position.z = damp(root.position.z, targetLean, 3.5, dt);
      root.rotation.x = damp(root.rotation.x, targetRootPitch, 3.5, dt);

      leftEye.scale.y = eyeScaleY;
      rightEye.scale.y = eyeScaleY;

      const browY = baseBrowY + targetBrow * 0.03;
      leftBrow.position.y = damp(leftBrow.position.y, browY, 8, dt);
      rightBrow.position.y = damp(rightBrow.position.y, browY, 8, dt);

      const openTarget =
        state === "speaking"
          ? Math.min(1, open * 1.15)
          : state === "thinking"
            ? 0.04
            : 0;
      const wideTarget = state === "speaking" ? Math.min(1, wide) : 0;
      // Fast attack, slightly slower release so the mouth tracks speech crisply.
      mouthOpen = damp(mouthOpen, openTarget, openTarget > mouthOpen ? 34 : 20, dt);
      mouthWide = damp(mouthWide, wideTarget, 20, dt);
      mouth.scale.y = baseMouthY * (1 + mouthOpen * 2.2);
      mouth.scale.x = baseMouthX * (1 + mouthWide * 0.22 - mouthOpen * 0.1);
    },
  };
}
