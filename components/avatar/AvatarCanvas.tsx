"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { loadAvatar, type AvatarParts, type AvatarVariant } from "./avatarLoader";
import {
  createAvatarAnimator,
  type AvatarAnimator,
  type AvatarState,
} from "./useAvatarControls";

interface AvatarCanvasProps {
  state: AvatarState;
  variant: AvatarVariant;
  /** Optional GLB url; used only if it has facial blendshapes, else built-in. */
  glbUrl?: string;
  getAmplitude?: () => number;
  getMouthShape?: () => { open: number; wide: number };
  className?: string;
  /** True when a GLB is loaded (changes camera framing to zoom in on face). */
  isGLB?: boolean;
}

export function AvatarCanvas({
  state,
  variant,
  glbUrl,
  getAmplitude,
  getMouthShape,
  className,
  isGLB = false,
}: AvatarCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const partsRef = useRef<AvatarParts | null>(null);
  const animatorRef = useRef<AvatarAnimator | null>(null);

  const stateRef = useRef<AvatarState>(state);
  const ampRef = useRef<typeof getAmplitude>(getAmplitude);
  const mouthRef = useRef<typeof getMouthShape>(getMouthShape);
  const isGLBRef = useRef(isGLB);
  useEffect(() => void (stateRef.current = state), [state]);
  useEffect(() => void (ampRef.current = getAmplitude), [getAmplitude]);
  useEffect(() => void (mouthRef.current = getMouthShape), [getMouthShape]);
  useEffect(() => void (isGLBRef.current = isGLB), [isGLB]);

  /* ── Renderer / scene / lights / loop (mount once) ── */
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth || 600;
    const height = mount.clientHeight || 600;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.setClearAlpha(0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, { display: "block", width: "100%", height: "100%" });

    // GLB full-body avatars are framed much tighter (face + neck only) so the
    // T-pose arms/body are below the frame and the face fills the canvas.
    const camera = new THREE.PerspectiveCamera(
      isGLBRef.current ? 36 : 30,
      width / height, 0.1, 100
    );
    if (isGLBRef.current) {
      camera.position.set(0, 1.3, 3.8);
      camera.lookAt(0, 1.1, 0);
    } else {
      camera.position.set(0, 1.05, 3.6);
      camera.lookAt(0, 0.9, 0);
    }
    const cameraRef = { cam: camera };

    const scene = new THREE.Scene();
    scene.userData.cameraRef = cameraRef;
    sceneRef.current = scene;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    scene.add(new THREE.HemisphereLight(0xfff6e9, 0x202024, 0.5));
    const key = new THREE.DirectionalLight(0xfff1dd, 2.6);
    key.position.set(2.5, 3, 3.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.9);
    fill.position.set(-3, 0.5, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffb547, 3.4);
    rim.position.set(-1.6, 2.2, -3);
    scene.add(rim);

    const onResize = () => {
      const w = mount.clientWidth || width;
      const h = mount.clientHeight || height;
      cameraRef.cam.aspect = w / h;
      cameraRef.cam.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    const clock = new THREE.Clock();
    let raf = 0;
    let elapsed = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = clock.getDelta();
      elapsed += dt;
      const amplitude = ampRef.current?.() ?? 0;
      const shape = mouthRef.current?.() ?? { open: 0, wide: 0 };
      const st = stateRef.current;

      // Guarantee mouth moves while speaking even if amplitude reads near-zero.
      // Blend between the real signal and a sine-wave fallback.
      const sineFallback = st === "speaking"
        ? 0.18 + 0.18 * Math.abs(Math.sin(elapsed * 9.5))
        : 0;
      const openDriven = Math.max(shape.open, sineFallback);
      const ampDriven = Math.max(amplitude, sineFallback * 0.7);

      animatorRef.current?.update(dt, {
        amplitude: ampDriven,
        open: openDriven,
        wide: shape.wide,
        state: st,
      });
      renderer.render(scene, cameraRef.cam);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (partsRef.current) {
        scene.remove(partsRef.current.root);
        partsRef.current.dispose();
        partsRef.current = null;
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  /* ── Load / swap the avatar when variant or GLB changes ── */
  useEffect(() => {
    let cancelled = false;
    loadAvatar(glbUrl, variant).then((p) => {
      if (cancelled) {
        p.dispose();
        return;
      }
      const scene = sceneRef.current;
      if (partsRef.current && scene) {
        scene.remove(partsRef.current.root);
        partsRef.current.dispose();
      }
      partsRef.current = p;
      animatorRef.current = createAvatarAnimator(p);
      scene?.add(p.root);
      // Update camera framing for the loaded type.
      const cam = (scene?.userData?.cameraRef as { cam: THREE.PerspectiveCamera } | undefined)?.cam;
      if (cam) {
        if (p.isGLB) {
          cam.fov = 36;
          cam.position.set(0, 1.3, 3.8);
          cam.lookAt(0, 1.1, 0);
        } else {
          cam.fov = 30;
          cam.position.set(0, 1.05, 3.6);
          cam.lookAt(0, 0.9, 0);
        }
        cam.updateProjectionMatrix();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [variant, glbUrl]);

  return <div ref={mountRef} className={className} />;
}

export default AvatarCanvas;
