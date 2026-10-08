import { Color } from "three";

/**
 * Per-frame uniform contract between the scroll runtime (Track B, `src/lib/scrollState.ts`)
 * and the FX layer. A plain mutable object: the loop writes it, `useFrame` reads it.
 * Never put it in React state.
 *
 *  p           0..1   scroll progress through the pinned hero
 *  rpm         0..7400
 *  combustion  0..1   firing intensity (drives rays + the flash material)
 *  fog         0..1   exhaust density
 *  launch      0..1   the last 8% of scroll (dissolve -> streaks -> white-out)
 *  time        seconds, monotonic (noise animates from this; freeze it for deterministic shots)
 */
export type FxState = {
  p: number;
  rpm: number;
  combustion: number;
  fog: number;
  launch: number;
  time: number;
};

export type FxQuality = "high" | "mid" | "low";

export const RPM_IDLE = 800;
export const RPM_LIMITER = 2500;

export function createFxState(partial: Partial<FxState> = {}): FxState {
  return { p: 0, rpm: RPM_IDLE, combustion: 0, fog: 0, launch: 0, time: 0, ...partial };
}

/** Distortion strength: 0 at idle, 1 at the limiter, eased so the build is back-loaded. */
export function rpmToStrength(rpm: number): number {
  const t = Math.min(Math.max((rpm - RPM_IDLE) / (RPM_LIMITER - RPM_IDLE), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Launch white-out ramps over the final stretch of the launch beat. */
export function launchToFlash(launch: number): number {
  const t = Math.min(Math.max((launch - 0.85) / 0.15, 0), 1);
  return t * t;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/* DESIGN.md palette, as linear THREE.Color (Color.set converts sRGB hex -> linear). */
export const HEAT = {
  ember: new Color("#f0c419"),
  emberHot: new Color("#ffe680"),
  whiteHot: new Color("#ffffff"),
  steel: new Color("#8a929b"),
  fogSteel: new Color("#7f868e"),
  steelDark: new Color("#262b31"),
  background: new Color("#050607"),
} as const;

export const FOG_LAYERS: Record<FxQuality, number> = { high: 6, mid: 4, low: 2 };
export const POINT_COUNT: Record<FxQuality, number> = { high: 120_000, mid: 60_000, low: 35_000 };
