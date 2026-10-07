"use client";

/*
  AudioToggle: the one control for the engine sound. Mono signage label, no icon. Lives in the nav.
  Audio never autoplays; it is unlocked by the START press and muted by default on touch.
  Muted state is read through useSyncExternalStore so server and client agree on first paint
  (server snapshot: muted) and no setState runs inside an effect.
*/

import { useSyncExternalStore } from "react";
import { site } from "@/content/site";
import { engineAudio } from "@/lib/audio";

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const notify = () => listeners.forEach((cb) => cb());
const getSnapshot = () => engineAudio.muted;
const getServerSnapshot = () => true;

export function AudioToggle() {
  const muted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const onToggle = () => {
    engineAudio.toggle();
    notify();
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!muted}
      className="label-mono text-muted hover:text-text transition-colors duration-fast ease-ui px-2 min-h-11"
    >
      {muted ? site.gate.audioToggleOff : site.gate.audioToggleOn}
    </button>
  );
}
