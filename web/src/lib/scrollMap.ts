/*
  The beat table. The ONE tunable file for the engine stage.
  p is the stage scroll progress (0..1 over 400vh). Every function here is pure.

  Narrative (decided 2026-10-06): the engine idles assembled, scroll takes it apart layer by
  layer (dive), it slams back together (combustion), revs, hits the limiter, launches, then idles
  dimmed behind the content for the rest of the page.

  Where the stage lives (2026-10-09): the hero is pinned for STAGE_SCREENS screens, so p runs over
  the first (STAGE_SCREENS - 1) screens of scroll with the hero copy held in place. Before this the
  timeline ran over the whole page and the explode peaked behind the Work panels, where nobody
  saw it (Eris: "they never really see it deconstruct").
*/

/** Screens of scroll the hero holds for: the stage is (STAGE_SCREENS - 1) screens of travel. */
export const STAGE_SCREENS = 2;

import type { BeatId } from "@/content/site";
import { ENGINE_GEOMETRY } from "./engine/engineContract";

export type Beat = {
  id: BeatId;
  /** inclusive start */
  from: number;
  /** exclusive end (inclusive for the last beat) */
  to: number;
  /** rpm at `from` */
  rpmFrom: number;
  /** rpm at `to` */
  rpmTo: number;
};

const { idleRpm } = ENGINE_GEOMETRY;

/** The stage never screams: the revs are held, not pinned. These are the ceilings per beat. */
export const REV_HOLD_RPM = 2200;
export const STAGE_LIMITER_RPM = 2500;

export const BEATS: readonly Beat[] = [
  { id: "idle", from: 0.0, to: 0.1, rpmFrom: idleRpm, rpmTo: idleRpm },
  { id: "dive", from: 0.1, to: 0.4, rpmFrom: idleRpm, rpmTo: 1100 },
  { id: "combustion", from: 0.4, to: 0.65, rpmFrom: 1100, rpmTo: 1500 },
  { id: "rev", from: 0.65, to: 0.88, rpmFrom: 1500, rpmTo: REV_HOLD_RPM },
  { id: "limiter", from: 0.88, to: 0.94, rpmFrom: REV_HOLD_RPM, rpmTo: STAGE_LIMITER_RPM },
  { id: "launch", from: 0.94, to: 1.0, rpmFrom: STAGE_LIMITER_RPM, rpmTo: idleRpm },
];

export const LAUNCH_START = 0.94;
/** Explode window: fully apart at EXPLODE_PEAK, back together by EXPLODE_END. */
export const EXPLODE_START = 0.05;
export const EXPLODE_PEAK = 0.45;
export const EXPLODE_END = 0.9;
/** Part stagger: outer parts leave last and come home first. 0 = all parts move together. */
export const EXPLODE_STAGGER = 0.35;
/** Fraction of the author's exploded offsets used at full explode, so the stack stays in frame. */
export const EXPLODE_AMPLITUDE = 0.9;
/** Content era: once the stage is over the engine comes apart again, slowly, as the page scrolls
    (q = content progress), and stays apart. Faint behind the panels, it is texture, not a show. */
export const CONTENT_EXPLODE_START = 0.04;
export const CONTENT_EXPLODE_END = 0.7;

/** Hz of the fuel-cut stutter on the limiter. */
export const LIMITER_STUTTER_HZ = 11;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** smoothstep 0..1 */
export const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

export function beatForProgress(p: number): Beat {
  const x = clamp01(p);
  for (const b of BEATS) if (x >= b.from && x < b.to) return b;
  return BEATS[BEATS.length - 1];
}

/** 0..1 position inside the current beat. */
export function beatLocal(p: number): number {
  const b = beatForProgress(p);
  return clamp01((clamp01(p) - b.from) / (b.to - b.from));
}

/**
 * Scrubbed rpm for a scroll progress. Non-decreasing up to the launch beat, where the engine
 * settles back to idle for the content view.
 */
export function rpmForProgress(p: number): number {
  const b = beatForProgress(p);
  const t = beatLocal(p);
  if (b.id === "launch") return lerp(b.rpmFrom, b.rpmTo, smooth(t));
  return lerp(b.rpmFrom, b.rpmTo, t);
}

/**
 * Limiter fuel-cut: in the limiter beat the rpm stutters with time.
 * Returns an rpm offset to ADD to rpmForProgress. 0 outside the limiter window.
 */
export function limiterStutter(p: number, time: number): number {
  const b = beatForProgress(p);
  if (b.id !== "limiter") return 0;
  const sq = Math.sin(time * Math.PI * 2 * LIMITER_STUTTER_HZ) > 0 ? 1 : 0;
  return -sq * (STAGE_LIMITER_RPM - REV_HOLD_RPM);
}

/** Launch beat progress 0..1 over p 0.94..1. Drives the ember flash and the canvas dim. */
export function launchForProgress(p: number): number {
  return smooth((clamp01(p) - LAUNCH_START) / (1 - LAUNCH_START));
}

/**
 * Explode amount 0..1: 0 assembled at idle, 1 fully apart at EXPLODE_PEAK, 0 again from
 * EXPLODE_END on. Eased both ways so the parts never snap.
 */
export function explodeForProgress(p: number): number {
  const x = clamp01(p);
  if (x <= EXPLODE_START) return 0;
  if (x < EXPLODE_PEAK) return smooth((x - EXPLODE_START) / (EXPLODE_PEAK - EXPLODE_START));
  if (x < EXPLODE_END) return 1 - smooth((x - EXPLODE_PEAK) / (EXPLODE_END - EXPLODE_PEAK));
  return 0;
}

/** Explode amount 0..1 from the content progress q: 0 until CONTENT_EXPLODE_START, eased to 1 at
    CONTENT_EXPLODE_END, held there to the bottom of the page. */
export function contentExplodeForProgress(q: number): number {
  return smooth((clamp01(q) - CONTENT_EXPLODE_START) / (CONTENT_EXPLODE_END - CONTENT_EXPLODE_START));
}

/** The explode the scene shows: the stage's own, or the content era's, whichever is larger. */
export function explodeForState(p: number, q: number): number {
  return Math.max(explodeForProgress(p), contentExplodeForProgress(q));
}

/**
 * Per-part explode amount for a global amount `k` and a part rank 0..1 (0 = nearest the block,
 * 1 = outermost). Outer parts start later on the way out, so the stack opens layer by layer, and
 * because the same mapping runs in reverse they close first on the way back.
 */
export function partExplode(k: number, rank: number, stagger = EXPLODE_STAGGER): number {
  const r = clamp01(rank);
  const s = Math.max(0, stagger);
  return smooth(clamp01(k) * (1 + s) - s * r);
}

/** Exhaust fog amount 0..1, ramps with rpm and tops out at half density at the stage limiter. */
export const FOG_MAX = 0.5;
export function fogForRpm(rpm: number): number {
  return smooth((rpm - idleRpm) / (STAGE_LIMITER_RPM - idleRpm)) * FOG_MAX;
}

/** HUD heat value 0..100 (no unit, deliberately not fake-precise). */
export function tempForRpm(rpm: number): number {
  return Math.round(clamp01(rpm / STAGE_LIMITER_RPM) * 100);
}

/** Camera shake amplitude 0..1, a faint tremor through the rev beat. */
export function shakeForRpm(rpm: number): number {
  return smooth((rpm - 1800) / (STAGE_LIMITER_RPM - 1800)) * 0.35;
}

/**
 * Time-based ignition (t = 0..1 over 1.8s):
 *   0.00..0.30 starter cranks, rpm 0→220, rattle
 *   0.30..0.70 three misfires (rpm dips)
 *   0.70..1.00 fires, overshoot to 1200, settles to idle
 */
export const IGNITION_SECONDS = 1.8;
export const MISFIRE_TIMES = [0.36, 0.5, 0.64] as const;

export function ignitionRpm(t: number): number {
  const x = clamp01(t);
  if (x < 0.3) return lerp(0, 220, smooth(x / 0.3));
  if (x < 0.7) {
    const dip = MISFIRE_TIMES.reduce((acc, m) => acc + Math.max(0, 1 - Math.abs(x - m) / 0.05), 0);
    return 220 + dip * 180;
  }
  const u = (x - 0.7) / 0.3;
  if (u < 0.5) return lerp(220, 1200, smooth(u / 0.5));
  return lerp(1200, idleRpm, smooth((u - 0.5) / 0.5));
}

/** Misfire flash intensity 0..1 during ignition. */
export function ignitionFlash(t: number): number {
  const x = clamp01(t);
  let v = 0;
  for (const m of MISFIRE_TIMES) v = Math.max(v, Math.max(0, 1 - Math.abs(x - m) / 0.03));
  if (x > 0.72 && x < 0.8) v = Math.max(v, 1 - (x - 0.72) / 0.08);
  return v;
}

/** Starter rattle amplitude 0..1 during ignition. */
export function ignitionRattle(t: number): number {
  const x = clamp01(t);
  return x < 0.7 ? 1 : 1 - smooth((x - 0.7) / 0.1);
}
