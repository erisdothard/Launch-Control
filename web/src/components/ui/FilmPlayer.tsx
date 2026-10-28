"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

export interface FilmPlayerProps {
  poster: string;
  /** 1080p for desktop, 720p for phones. */
  sources: { desk: string; phone: string };
  label: string;
}

/*
  A silent film that plays while it is on screen and pauses when it leaves. preload="none" keeps the
  page weight at the poster until the visitor reaches it. Under prefers-reduced-motion it never starts
  on its own; the controls are there either way.
*/
export function FilmPlayer({ poster, sources, label }: FilmPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const video = ref.current;
    if (!video || reduced) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Autoplay can still be refused (data saver, low power); the poster and controls remain.
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [reduced]);

  return (
    <video
      ref={ref}
      aria-label={label}
      poster={poster}
      width={1920}
      height={1080}
      muted
      loop
      playsInline
      controls
      preload="none"
      className="block aspect-video h-auto w-full bg-background"
    >
      <source src={sources.phone} type="video/mp4" media="(max-width: 767px)" />
      <source src={sources.desk} type="video/mp4" />
    </video>
  );
}
