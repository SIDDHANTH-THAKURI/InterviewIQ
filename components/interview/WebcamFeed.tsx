"use client";

import { CameraOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface WebcamFeedProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  active?: boolean;
  label?: string;
  className?: string;
}

/** The candidate's self-view — a tasteful, mirrored video-call pip. */
export function WebcamFeed({ videoRef, active = true, label = "You", className }: WebcamFeedProps) {
  return (
    <div
      className={cn(
        "relative aspect-video overflow-hidden rounded-card border border-white/10 bg-black shadow-lift",
        className
      )}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="h-full w-full -scale-x-100 object-cover"
      />
      {!active && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-charcoal text-cream/50">
          <CameraOff className="h-6 w-6" />
          <span className="text-xs">Camera off</span>
        </div>
      )}
      <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur">
        {active && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
        {label}
      </div>
    </div>
  );
}
