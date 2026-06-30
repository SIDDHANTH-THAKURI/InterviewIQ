import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type AvatarVariant = "male" | "female";

export interface AvatarParts {
  root: THREE.Group;
  head: THREE.Group;
  leftEye: THREE.Object3D;
  rightEye: THREE.Object3D;
  leftBrow: THREE.Object3D;
  rightBrow: THREE.Object3D;
  mouth: THREE.Object3D;
  torso: THREE.Object3D;
  /** True when a real GLB with facial blendshapes was loaded. */
  isGLB: boolean;
  dispose: () => void;
}

const PALETTE = {
  male: {
    skin: 0xe7c6a3,
    skinShade: 0xd2ad86,
    lip: 0xb87a66,
    hair: 0x241a12,
    suit: 0x232838,
    shirt: 0xf4f4f1,
    accent: 0xf59e0b,
  },
  female: {
    skin: 0xf0d2b6,
    skinShade: 0xe2bd9b,
    lip: 0xc8675f,
    hair: 0x4a2f1d,
    suit: 0x33294a,
    shirt: 0xf6f1ec,
    accent: 0xf59e0b,
  },
};

const EYE = 0x223247;
const PUPIL = 0x0c1016;
const WHITE = 0xf8f7f4;

function smat(color: number, rough = 0.55, metal = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

export function buildStylizedAvatar(variant: AvatarVariant = "female"): AvatarParts {
  const P = PALETTE[variant];
  const male = variant === "male";
  const owned: THREE.Object3D[] = [];
  const keep = <T extends THREE.Object3D>(o: T) => {
    owned.push(o);
    return o;
  };

  const root = new THREE.Group();

  const skinMat = smat(P.skin, 0.58, 0.02);
  const lipMat = smat(P.lip, 0.45);
  const hairMat = smat(P.hair, 0.78);
  const suitMat = smat(P.suit, 0.82, 0.05);
  const shirtMat = smat(P.shirt, 0.6);
  const accentMat = smat(P.accent, 0.45);
  const eyeMat = smat(EYE, 0.16);
  const pupilMat = smat(PUPIL, 0.85);
  const whiteMat = smat(WHITE, 0.22);
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  /* ── Shoulders / chest ── */
  const shoulders = keep(new THREE.Mesh(new THREE.CapsuleGeometry(male ? 0.54 : 0.46, 1.0, 14, 32), suitMat));
  shoulders.rotation.z = Math.PI / 2;
  shoulders.scale.z = 0.6;
  shoulders.position.y = 0.02;
  root.add(shoulders);

  const chest = keep(new THREE.Mesh(new THREE.SphereGeometry(0.56, 32, 24), suitMat));
  chest.scale.set(1.05, 0.7, 0.6);
  chest.position.y = -0.28;
  root.add(chest);

  // Shirt collar V
  const collarGeo = new THREE.BufferGeometry();
  collarGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([
        -0.07, 0.4, 0.27, -0.19, 0.12, 0.26, -0.03, 0.12, 0.3, 0.07, 0.4, 0.27,
        0.19, 0.12, 0.26, 0.03, 0.12, 0.3,
      ]),
      3
    )
  );
  collarGeo.setIndex([0, 1, 2, 3, 5, 4]);
  collarGeo.computeVertexNormals();
  root.add(keep(new THREE.Mesh(collarGeo, shirtMat)));

  if (male) {
    const tie = keep(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.02), accentMat));
    tie.position.set(0, 0.06, 0.29);
    root.add(tie);
    const knot = keep(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.025), accentMat));
    knot.position.set(0, 0.3, 0.29);
    root.add(knot);
  }

  /* ── Neck ── */
  const neck = keep(new THREE.Mesh(new THREE.CylinderGeometry(male ? 0.16 : 0.13, male ? 0.2 : 0.17, 0.4, 28), skinMat));
  neck.position.y = 0.52;
  root.add(neck);

  /* ── Head (single smooth form + subtle chin) ── */
  const head = new THREE.Group();
  head.position.y = 0.98;
  root.add(head);

  const cranium = keep(new THREE.Mesh(new THREE.SphereGeometry(0.5, 64, 56), skinMat));
  cranium.scale.set(male ? 0.99 : 0.9, male ? 1.0 : 1.06, male ? 0.97 : 0.92);
  head.add(cranium);

  // Chin/jaw — square for male, soft taper for female
  const chin = keep(new THREE.Mesh(new THREE.SphereGeometry(0.3, 40, 32), skinMat));
  if (male) chin.scale.set(0.92, 0.62, 0.78);
  else chin.scale.set(0.74, 0.6, 0.74);
  chin.position.set(0, -0.3, 0.04);
  head.add(chin);

  /* ── Hair ── */
  // Hair cap sits high on the crown and pushed back in Z so the sphere
  // doesn't wrap over the face — eyes and brows stay visible.
  const hairCap = keep(new THREE.Mesh(new THREE.SphereGeometry(0.52, 48, 36), hairMat));
  if (male) {
    hairCap.scale.set(1.0, 0.50, 0.92);
    hairCap.position.set(0, 0.27, -0.06);
  } else {
    hairCap.scale.set(1.08, 0.68, 0.90);
    hairCap.position.set(0, 0.29, -0.12);
  }
  head.add(hairCap);

  if (!male) {
    // Side strands pushed back so they frame the face without blocking it
    for (const x of [-1, 1]) {
      const side = keep(new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.55, 8, 16), hairMat));
      side.scale.set(0.62, 1, 0.58);
      side.position.set(x * 0.44, -0.14, -0.09);
      head.add(side);
    }
    const back = keep(new THREE.Mesh(new THREE.SphereGeometry(0.46, 32, 24), hairMat));
    back.scale.set(0.96, 1.15, 0.72);
    back.position.set(0, -0.08, -0.22);
    head.add(back);
  }

  /* ── Ears (+ earrings for female) ── */
  for (const x of [-1, 1]) {
    const ear = keep(new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 14), skinMat));
    ear.scale.set(0.42, 0.66, 0.38);
    ear.position.set(x * 0.47, -0.03, 0.02);
    head.add(ear);
    if (!male) {
      const earring = keep(new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 12), accentMat));
      earring.position.set(x * 0.48, -0.12, 0.04);
      head.add(earring);
    }
  }

  /* ── Nose (simple rounded sphere, no bridge) ── */
  const nose = keep(new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 16), skinMat));
  nose.scale.set(1, 0.95, 0.9);
  nose.position.set(0, -0.04, 0.5);
  head.add(nose);

  /* ── Eyes ── */
  const makeEye = (x: number) => {
    const orbit = keep(new THREE.Group());
    orbit.position.set(x, 0.08, 0.42);
    head.add(orbit);
    const sclera = keep(new THREE.Mesh(new THREE.SphereGeometry(0.08, 32, 24), whiteMat));
    sclera.scale.set(1, male ? 0.74 : 0.82, 0.7);
    orbit.add(sclera);
    const iris = keep(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.01, 32), eyeMat));
    iris.rotation.x = Math.PI / 2;
    iris.position.z = 0.05;
    orbit.add(iris);
    const pupil = keep(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 24), pupilMat));
    pupil.rotation.x = Math.PI / 2;
    pupil.position.z = 0.053;
    orbit.add(pupil);
    const glint = keep(new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), glintMat));
    glint.position.set(0.015, 0.016, 0.06);
    orbit.add(glint);
    return orbit;
  };
  const leftEye = makeEye(-0.175);
  const rightEye = makeEye(0.175);

  /* ── Brows ── */
  const makeBrow = (x: number) => {
    const brow = keep(new THREE.Mesh(new THREE.CapsuleGeometry(male ? 0.017 : 0.0095, male ? 0.12 : 0.1, 6, 12), hairMat));
    // Flat/heavier for male; thinner and gently arched for female.
    brow.rotation.z = male ? 0 : x < 0 ? -0.16 : 0.16;
    brow.scale.set(1, 1, 0.5);
    brow.position.set(x, male ? 0.21 : 0.225, 0.45);
    head.add(brow);
    return brow;
  };
  const leftBrow = makeBrow(-0.175);
  const rightBrow = makeBrow(0.175);

  /* ── Mouth (lip-sync target — upper lip removed per user preference) ── */
  const mouth = keep(new THREE.Mesh(new THREE.SphereGeometry(0.088, 28, 16), lipMat));
  mouth.scale.set(male ? 1.06 : 0.98, male ? 0.18 : 0.24, 0.55);
  mouth.position.set(0, -0.235, 0.46);
  head.add(mouth);

  const dispose = () => {
    for (const o of owned) {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) (mat as THREE.Material).dispose();
    }
  };

  return { root, head, leftEye, rightEye, leftBrow, rightBrow, mouth, torso: chest, isGLB: false, dispose };
}

/* ── GLB loader with blendshape validation ──────────────────────────────── */

const VISEME_HINTS = ["jawopen", "mouthopen", "viseme_", "v_aa", "mouthfunnel"];

export async function loadAvatar(
  url: string | undefined,
  variant: AvatarVariant
): Promise<AvatarParts> {
  if (!url) return buildStylizedAvatar(variant);

  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene as THREE.Group;

    const skinned: THREE.SkinnedMesh[] = [];
    let hasVisemes = false;
    root.traverse((obj) => {
      const sm = obj as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh || (obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh & { morphTargetDictionary?: Record<string, number> };
        (obj as THREE.Mesh).frustumCulled = false;
        if (m.morphTargetDictionary) {
          skinned.push(sm);
          for (const name of Object.keys(m.morphTargetDictionary)) {
            const lower = name.toLowerCase();
            if (VISEME_HINTS.some((h) => lower.includes(h))) hasVisemes = true;
          }
        }
      }
    });

    if (!hasVisemes) {
      console.warn(
        `[avatar] ${url} has no facial blendshapes (visemes) — using the built-in ${variant} avatar instead. Use an Avaturn GLB for realistic lip-sync.`
      );
      return buildStylizedAvatar(variant);
    }

    const setMorph = (needle: string, value: number) => {
      for (const m of skinned) {
        const d = (m as unknown as { morphTargetDictionary?: Record<string, number> }).morphTargetDictionary;
        const infl = m.morphTargetInfluences;
        if (!d || !infl) continue;
        for (const [name, idx] of Object.entries(d)) {
          if (name.toLowerCase().includes(needle)) infl[idx] = value;
        }
      }
    };

    let headBone: THREE.Object3D = root;
    const strip: THREE.Object3D[] = [];
    root.traverse((o) => {
      const n = o.name.toLowerCase();
      if (n === "head" || n.endsWith("head") || n === "mixamorighead") headBone = o;
      // Remove any lights/cameras embedded in the export so they don't fight
      // our scene lighting.
      const any = o as unknown as { isLight?: boolean; isCamera?: boolean };
      if (any.isLight || any.isCamera) strip.push(o);
    });
    strip.forEach((o) => o.parent?.remove(o));

    // Rotate arm bones to a natural resting pose so it doesn't look like a T-pose.
    poseArmsNatural(root);

    // Frame the head+shoulders, then wrap so the animator can sway/lean the whole
    // avatar without disturbing that framing transform.
    frameToHead(root, headBone);
    const wrapper = new THREE.Group();
    wrapper.add(root);

    const dummy = new THREE.Object3D();

    const eyeProxy = makeMorphProxy("y", (v) => {
      const blink = 1 - Math.max(0, Math.min(1, v));
      setMorph("eyeblinkleft", blink);
      setMorph("eyeblinkright", blink);
    });
    const mouthProxy = makeMorphProxy("y", (v) => {
      // Cap at 0.3 — a natural speaking jaw drop, never the full wide gape.
      const open = Math.max(0, Math.min(0.3, (v - 0.2) / 0.4));
      setMorph("jawopen", open);
      setMorph("mouthopen", open);
    });

    const dispose = () => {
      root.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) (mat as THREE.Material).dispose();
      });
    };

    return {
      root: wrapper,
      head: headBone as THREE.Group,
      leftEye: eyeProxy,
      rightEye: eyeProxy,
      leftBrow: dummy,
      rightBrow: dummy,
      mouth: mouthProxy,
      torso: dummy,
      isGLB: true,
      dispose,
    };
  } catch (err) {
    console.warn("[avatar] GLB load failed, using built-in:", (err as Error).message);
    return buildStylizedAvatar(variant);
  }
}

/**
 * Builds a tiny Object3D-like proxy whose `.scale.<axis>` setter forwards to a
 * morph-target callback, so the same animator works for primitives and GLBs.
 */
function makeMorphProxy(axis: "x" | "y" | "z", onSet: (v: number) => void): THREE.Object3D {
  const scale = new Proxy({ x: 1, y: 0.2, z: 1 } as Record<string, number>, {
    set(t, prop, value) {
      t[prop as string] = value as number;
      if (prop === axis) onSet(value as number);
      return true;
    },
  });
  const obj = new THREE.Object3D();
  Object.defineProperty(obj, "scale", { value: scale, writable: false });
  return obj;
}

/**
 * Forces arm bones from T-pose into a natural hanging position.
 * Uses SET (not +=) so it overrides whatever baked rotation the bone has,
 * then marks the skeleton dirty so Three.js keeps the pose during render.
 */
function poseArmsNatural(root: THREE.Object3D) {
  const isLeft = (n: string) => /left|\bl\b|_l$/i.test(n);

  // Collect all skeletons so we can call update() after posing.
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton) skeletons.add(sm.skeleton);
  });

  skeletons.forEach((sk) => {
    sk.bones.forEach((bone) => {
      const n = bone.name;
      if (!n) return;
      const left = isLeft(n);
      const sign = left ? 1 : -1; // left arm rotates +Z, right -Z to hang down

      if (/upper.?arm|upperarm/i.test(n) && !/fore/i.test(n)) {
        // Reset entirely, then rotate ONLY on Z to bring arm straight down.
        bone.rotation.set(0, 0, sign * 1.5);
      } else if (/fore.?arm|lowerarm/i.test(n)) {
        bone.rotation.set(0, 0, sign * -0.06);
      } else if (/\bhand\b/i.test(n) && !/finger|thumb/i.test(n)) {
        bone.rotation.set(0, 0, 0);
      }
    });
    sk.update();
  });
}

/**
 * Scales a loaded avatar and positions it so the head + shoulders fill the
 * frame, anchored on the head bone. Tuned for full-body exports; if your avatar
 * sits too high/low or too big/small, tweak HEAD_TARGET_Y / FILL.
 */
const HEAD_TARGET_Y = 1.12;
const FILL = 7.0;
function frameToHead(model: THREE.Object3D, head: THREE.Object3D) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y < 1e-3) return;
  model.scale.setScalar(FILL / size.y);
  model.updateMatrixWorld(true);
  const headPos = new THREE.Vector3();
  head.getWorldPosition(headPos);
  model.position.x += -headPos.x;
  model.position.z += -headPos.z;
  model.position.y += HEAD_TARGET_Y - headPos.y;
}
