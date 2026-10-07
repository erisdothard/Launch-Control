/*
  Gate state machine: loading → ready → igniting → idle → scrolling → launched.
  Vanilla store with useSyncExternalStore. Session flag `lc:launched` means the gate is never
  shown twice per session.
*/

import { useSyncExternalStore } from "react";

export type Phase = "loading" | "ready" | "igniting" | "idle" | "scrolling" | "launched";

/** How the hero renders. `full` is the 3D sequence; `poster` is the static frame. */
export type HeroMode = "full" | "poster";

export const LAUNCHED_KEY = "lc:launched";

type Listener = () => void;

type PhaseStore = {
  phase: Phase;
  /** 0..100, honest load counter for the gate */
  loadProgress: number;
  /** a press that arrived before `ready` */
  queued: boolean;
  /** why the hero is a poster (null = full 3D) */
  posterReason: null | "reduced-motion" | "no-webgl" | "context-lost" | "launched";
  /** true when the gate has been bypassed or passed */
  gateOpen: boolean;
};

const state: PhaseStore = {
  phase: "loading",
  loadProgress: 0,
  queued: false,
  posterReason: null,
  gateOpen: false,
};

const listeners = new Set<Listener>();
let snapshot: PhaseStore = { ...state };

function emit() {
  snapshot = { ...state };
  for (const l of listeners) l();
}

export function getPhase(): PhaseStore {
  return snapshot;
}

const SERVER_SNAPSHOT: PhaseStore = { ...state };
function getServerSnapshot(): PhaseStore {
  return SERVER_SNAPSHOT;
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePhase(): PhaseStore {
  return useSyncExternalStore(subscribe, getPhase, getServerSnapshot);
}

const ORDER: Phase[] = ["loading", "ready", "igniting", "idle", "scrolling", "launched"];

export function setPhase(next: Phase) {
  if (state.phase === next) return;
  state.phase = next;
  if (next === "idle" || next === "scrolling" || next === "launched") state.gateOpen = true;
  if (next === "launched") markLaunched();
  emit();
}

export function setLoadProgress(n: number) {
  const v = Math.max(0, Math.min(100, Math.round(n)));
  if (v === state.loadProgress) return;
  state.loadProgress = v;
  emit();
}

export function setQueued(v: boolean) {
  if (state.queued === v) return;
  state.queued = v;
  emit();
}

export function setPoster(reason: PhaseStore["posterReason"]) {
  if (state.posterReason === reason) return;
  state.posterReason = reason;
  emit();
}

export function openGate() {
  if (state.gateOpen) return;
  state.gateOpen = true;
  emit();
}

export function isAtLeast(a: Phase, b: Phase): boolean {
  return ORDER.indexOf(a) >= ORDER.indexOf(b);
}

export function hasLaunchedThisSession(): boolean {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem(LAUNCHED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markLaunched() {
  try {
    sessionStorage.setItem(LAUNCHED_KEY, "1");
  } catch {
    /* storage blocked: the gate simply shows again next load */
  }
}

/** Reset for tests only. */
export function __resetPhase() {
  state.phase = "loading";
  state.loadProgress = 0;
  state.queued = false;
  state.posterReason = null;
  state.gateOpen = false;
  emit();
}
