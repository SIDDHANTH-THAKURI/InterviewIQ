"use client";

import { useEffect, useRef } from "react";

export type AuraMood = "idle" | "listening" | "thinking" | "speaking";

/** Palette per mood: [core, mid, rim]. Lerped on the CPU so transitions are smooth. */
const MOODS: Record<AuraMood, [number, number, number][]> = {
  idle: [hex("#ffe2bf"), hex("#ff8a4c"), hex("#5b21b6")],
  speaking: [hex("#fff4e2"), hex("#ffa25c"), hex("#c2410c")],
  listening: [hex("#e6f9ff"), hex("#4cc3f2"), hex("#312e81")],
  thinking: [hex("#f1eaff"), hex("#a78bfa"), hex("#4c1d95")],
};

const VERT = `#version 300 es
in vec2 p;
void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

// Domain-warped noise sphere with a soft rim and halo. Premultiplied alpha output.
const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uTime;
uniform float uLevel;
uniform float uEnergy;
uniform vec2 uPointer;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform float uScale;

vec3 hash3(vec3 p){
  p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
  return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}
float noise(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p);
  vec3 u = f*f*(3.0-2.0*f);
  return mix(mix(mix(dot(hash3(i+vec3(0,0,0)),f-vec3(0,0,0)), dot(hash3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                 mix(dot(hash3(i+vec3(0,1,0)),f-vec3(0,1,0)), dot(hash3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
             mix(mix(dot(hash3(i+vec3(0,0,1)),f-vec3(0,0,1)), dot(hash3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                 mix(dot(hash3(i+vec3(0,1,1)),f-vec3(0,1,1)), dot(hash3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);
}
float fbm(vec3 p){
  float v = 0.0; float a = 0.5;
  for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.02; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / min(uRes.x, uRes.y);
  // Fade everything out before the canvas edge so no box is ever visible.
  float frame = smoothstep(0.5, 0.33, length(uv));
  uv /= uScale;
  uv -= uPointer * 0.035;
  float t = uTime * (0.16 + uEnergy*0.22);
  float r = length(uv);

  float R = 0.30 + uLevel*0.045 + sin(uTime*0.9)*0.006;
  vec3 q = vec3(uv*2.2, t);
  float w = fbm(q + vec3(fbm(q*0.8 + 3.1), fbm(q*0.8 - 1.7), 0.0)*1.6);
  float edge = R + w*(0.035 + uLevel*0.06 + uEnergy*0.02);

  float body = smoothstep(edge + 0.012, edge - 0.012, r);
  // Spherical shading from a fake normal on the disc.
  float z = sqrt(max(0.0, 1.0 - min(1.0, (r*r)/(R*R))));
  float swirl = fbm(vec3(uv*3.2 + w*1.4, t*1.3));
  float bands = smoothstep(-0.35, 0.55, swirl*1.5 + uv.y*1.6 - uv.x*0.4);
  vec3 col = mix(uC, uB, bands);
  // An iridescent violet undertone in the flow's valleys adds depth.
  col = mix(col, vec3(0.42, 0.22, 0.86), (1.0 - bands) * 0.28 * (1.0 - smoothstep(0.0, 0.5, swirl)));
  // Liquid highlights where the flow folds over itself.
  col = mix(col, uA, smoothstep(0.18, 0.62, swirl + w*0.4) * (0.45 + uLevel*0.35));
  // Limb darkening gives depth; a cool-to-warm rim brings it back to light.
  col *= 0.42 + 0.58*pow(z, 0.6);
  float rim = pow(1.0 - z, 4.0);
  col += mix(uB, uA, 0.4) * rim * 0.9;
  // Soft specular.
  vec2 sp = uv - vec2(-0.1, 0.12)*(R/0.3);
  col += uA * exp(-dot(sp,sp)*55.0) * 0.28;

  // Outside the body: a coloured halo and a thin glow ring. Kept premultiplied
  // so the glow only ever adds light to whatever is behind the canvas.
  float d = max(r - edge, 0.0);
  float halo = exp(-d*8.0) * (0.22 + uLevel*0.5 + uEnergy*0.08) * (1.0 - body);
  float ring = exp(-pow((r - edge)*40.0, 2.0)) * (0.25 + uLevel*0.7) * (1.0 - body);
  vec3 rgb = col*body + mix(uB, uC, 0.45)*halo + uA*ring*0.6;
  float alpha = clamp(body + halo + ring*0.6, 0.0, 1.0);
  o = vec4(rgb, alpha) * frame;
}`;

interface AuraOrbProps {
  mood?: AuraMood;
  /** Returns current audio level 0..1 (called every frame). */
  getLevel?: () => number;
  /** 0..1 — how lively the surface flows. */
  energy?: number;
  /** Orb size relative to the canvas (1 = default). */
  scale?: number;
  /** Follow the pointer slightly. */
  interactive?: boolean;
  className?: string;
}

export function AuraOrb({ mood = "idle", getLevel, energy = 0.3, scale = 1, interactive = false, className }: AuraOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moodRef = useRef(mood);
  const levelRef = useRef(getLevel);
  const energyRef = useRef(energy);
  moodRef.current = mood;
  levelRef.current = getLevel;
  energyRef.current = energy;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!gl) {
      canvas.dataset.fallback = "1";
      return;
    }

    const prog = link(gl, VERT, FRAG);
    if (!prog) return;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = u("uRes"), uTime = u("uTime"), uLevel = u("uLevel"), uEnergy = u("uEnergy");
    const uPointer = u("uPointer"), uA = u("uA"), uB = u("uB"), uC = u("uC"), uScale = u("uScale");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      pointer.ty = -((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    if (interactive) window.addEventListener("pointermove", onMove);

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);

    const cur = MOODS[moodRef.current].map((c) => [...c]) as [number, number, number][];
    let level = 0;
    let energyNow = energyRef.current;
    let raf = 0;
    const start = performance.now();
    let last = start;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const target = MOODS[moodRef.current];
      const k = 1 - Math.exp(-dt * 3.2);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cur[i][j] += (target[i][j] - cur[i][j]) * k;

      const raw = Math.min(1, Math.max(0, levelRef.current?.() ?? 0));
      // Fast attack, slower release reads like breath.
      level += (raw - level) * (raw > level ? 0.45 : 0.08);
      energyNow += (energyRef.current - energyNow) * k;
      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, reduced ? 2.0 : (now - start) / 1000);
      gl.uniform1f(uLevel, level);
      gl.uniform1f(uEnergy, energyNow);
      gl.uniform2f(uPointer, pointer.x, pointer.y);
      gl.uniform3fv(uA, cur[0]);
      gl.uniform3fv(uB, cur[1]);
      gl.uniform3fv(uC, cur[2]);
      gl.uniform1f(uScale, scale);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, [interactive, scale]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ background: "transparent" }}
    />
  );
}

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("[aura]", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const v = compile(gl.VERTEX_SHADER, vs);
  const f = compile(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram()!;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn("[aura]", gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}
