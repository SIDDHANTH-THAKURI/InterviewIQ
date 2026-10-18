"use client";

import { useEffect, useRef, useState } from "react";
import { notFound } from "next/navigation";

/** Dev-only avatar evaluation page: /lab/avatar?a=maya&d=-0.4&y=0&amb=1&dir=14 */
export default function AvatarLab() {
  if (process.env.NODE_ENV === "production") notFound();
  const ref = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const name = q.get("a") || "maya";
    const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
    let head: { stop: () => void } | null = null;
    (async () => {
      try {
        const { TalkingHead } = await import("@met4citizen/talkinghead");
        const h = new TalkingHead(ref.current!, {
          ttsEndpoint: null,
          lipsyncModules: ["en"],
          lipsyncLang: "en",
          cameraView: q.get("view") || "upper",
          cameraDistance: num("d", 0),
          cameraY: num("y", 0),
          cameraRotateEnable: false,
          avatarMood: "neutral",
          lightAmbientColor: 0xfff2e6,
          lightAmbientIntensity: num("amb", 1.7),
          lightDirectColor: 0xfff0e0,
          lightDirectIntensity: num("dir", 20),
          lightDirectPhi: num("phi", 0.9),
          lightDirectTheta: num("theta", 2.3),
          lightSpotIntensity: num("spot", 10),
          lightSpotColor: 0xa9c2ff,
          lightSpotPhi: 0.15,
          lightSpotTheta: 4.2,
        });
        head = h;
        await h.showAvatar({ url: `/avatars/${name}.glb`, body: ["david", "james", "arjun"].includes(name) ? "M" : "F", lipsyncLang: "en" });
        setStatus("ready");
        (window as unknown as { head: unknown }).head = h;
      } catch (err) {
        setStatus("error: " + (err as Error).message);
      }
    })();
    return () => head?.stop();
  }, []);
  return (
    <main className="h-dvh bg-[linear-gradient(180deg,#2a2622,#161412)]">
      <p className="absolute left-4 top-4 z-10 text-sm">{status}</p>
      <div ref={ref} className="h-full w-full" />
    </main>
  );
}
