"use client";

/*
  Captions: one line per beat, Michroma uppercase in silver.
  Fixed to the viewport: left column, top locked at 30% so the baseline never jumps between beats.
  Crossfade `base` on beat change. aria-live="polite" region announces each caption once.
  The active beat is read from scrollState per frame; React re-renders only when it changes.
*/

import { useEffect, useState } from "react";
import { site, type BeatId } from "@/content/site";
import { scrollState } from "@/lib/scrollState";
import { onFrame } from "@/lib/loop";

export const CAPTIONS_ID = "hero-captions";

export function Captions() {
  const [beat, setBeat] = useState<BeatId>("idle");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let last: BeatId | null = null;
    let lastRunning = false;
    return onFrame(() => {
      const ph = scrollState.phase;
      const isRunning = ph === "idle" || ph === "scrolling" || ph === "launched";
      if (isRunning !== lastRunning) {
        lastRunning = isRunning;
        setRunning(isRunning);
      }
      if (scrollState.beat !== last) {
        last = scrollState.beat;
        setBeat(last);
      }
    });
  }, []);

  const active = site.beats.find((b) => b.id === beat) ?? site.beats[0];

  return (
    <div
      id={CAPTIONS_ID}
      tabIndex={-1}
      className="fixed left-6 md:left-12 right-6 md:right-auto top-[38%] md:w-[36%] max-w-[22ch] outline-none"
      style={{ zIndex: "var(--z-content)" }}
    >
      <div className="relative" aria-hidden="true">
        {site.beats.map((b) => (
          <p
            key={b.id}
            data-beat={b.id}
            className="absolute left-0 top-0 m-0 max-w-none font-display uppercase text-caption-3d leading-[1.2] tracking-display text-steel text-balance"
            style={{
              opacity: running && b.id === beat ? 1 : 0,
              transition: "opacity var(--duration-base) var(--ease-ui)",
            }}
          >
            {b.caption}
          </p>
        ))}
        <p className="invisible m-0 max-w-none font-display uppercase text-caption-3d leading-[1.2]">
          {active.caption}
        </p>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {running ? `${site.gate.srRunning} ${active.caption}` : ""}
      </p>
    </div>
  );
}
