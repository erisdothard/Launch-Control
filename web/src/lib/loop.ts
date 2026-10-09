/*
  The ONE requestAnimationFrame owner.
  gsap.ticker drives everything in a fixed order every tick:
    1. lenis.raf(ms)          smooth scroll
    2. ScrollTrigger.update() stage / content progress → scrollState.pRaw, q (trigger onUpdate)
    3. scrollState write      p (smoothed from pRaw), rpm, crank angle (integrated), combustion, fog,
                              launch, explode, time, beat
    4. R3F advance(ms)        the Canvas renders once (frameloop="never")
  Then DOM frame callbacks (tach needle, HUD) run after the scene so they never delay it.

  Strict-mode safe: startLoop() is ref-counted; the second mount in dev reuses the live instance.
  Idempotent: calling startLoop() twice without a dispose is harmless.
*/

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { scrollState } from "./scrollState";
import { getPhase, setPhase } from "./phase";
import {
  beatForProgress,
  explodeForState,
  fogForRpm,
  ignitionFlash,
  ignitionRpm,
  launchForProgress,
  limiterStutter,
  rpmForProgress,
  tempForRpm,
} from "./scrollMap";
import { firingCylinder, rpmToRadPerSec } from "./engine/engineContract";

export type Advance = (timestampMs: number) => void;
export type FrameCallback = (dt: number) => void;

const MAX_DT = 1 / 20;
/** Scroll smoothing rate (1/s). Higher follows the wheel faster; 5 ≈ 200 ms to settle. */
const P_SMOOTHING = 5;
/** On-screen crank speed as a fraction of the real rpm. The engine is a background: at real speed
    (800 rpm idle = 13 turns a second) the pistons read as a blur. 1/8 keeps them legible. */
const CRANK_VISUAL_SCALE = 0.125;
/** Below this gap p snaps to pRaw so phase thresholds fire the moment the wheel stops. */
const P_SNAP = 1e-3;

let refCount = 0;
let lenis: Lenis | null = null;
let advanceFn: Advance | null = null;
let heroTrigger: ScrollTrigger | null = null;
let contentTrigger: ScrollTrigger | null = null;
let frozenTime: number | null = null;
let registered = false;
const frameCallbacks = new Set<FrameCallback>();

function ensurePlugins() {
  if (registered) return;
  gsap.registerPlugin(ScrollTrigger);
  gsap.ticker.lagSmoothing(0);
  ScrollTrigger.config({ ignoreMobileResize: true });
  registered = true;
}

/** Combustion flash: 1 at the top of each 90° firing window, exponential decay. */
function combustionFor(rpm: number, t: number): number {
  if (rpm <= 0) return 0;
  return Math.exp(-t * 5);
}

function writeState(timeSec: number, dt: number) {
  const s = scrollState;
  const ph = getPhase().phase;
  s.phase = ph;
  s.dt = dt;

  const timeNow = frozenTime ?? s.time + dt;
  s.time = timeNow;

  // Smooth the stage progress so wheel steps become glide. Frozen time (debug shots) snaps.
  const gap = s.pRaw - s.p;
  if (frozenTime !== null || Math.abs(gap) < P_SNAP) s.p = s.pRaw;
  else s.p += gap * (1 - Math.exp(-dt * P_SMOOTHING));
  s.explode = explodeForState(s.p, s.q);

  let rpm = 0;
  if (ph === "igniting") rpm = ignitionRpm(s.ignition);
  else if (ph === "idle" || ph === "scrolling" || ph === "launched")
    rpm = rpmForProgress(s.p) + limiterStutter(s.p, timeNow);
  s.rpm = rpm;

  // Crank angle is integrated, never scrubbed. Scrolling back slows the engine, never rewinds it.
  // With time frozen (debug / visual tests) the angle is a pure function of (rpm, time) so a shot is deterministic.
  if (frozenTime === null) s.crankAngle += rpmToRadPerSec(rpm) * CRANK_VISUAL_SCALE * dt;
  else s.crankAngle = rpmToRadPerSec(rpm) * CRANK_VISUAL_SCALE * frozenTime;

  const fire = firingCylinder(s.crankAngle);
  s.cylinder = fire.cylinder;
  s.combustion = ph === "igniting" ? ignitionFlash(s.ignition) : combustionFor(rpm, fire.t);
  s.fog = fogForRpm(rpm);
  s.launch = launchForProgress(s.p);
  s.beat = beatForProgress(s.p).id;
  s.temp = tempForRpm(rpm);

  // Phase transitions driven by scroll.
  if (ph === "idle" && s.p > 0.002) setPhase("scrolling");
  else if (ph === "scrolling" && s.p >= 0.999) setPhase("launched");
  else if (ph === "launched" && s.p < 0.98) setPhase("scrolling");
}

function tick(time: number, deltaTime: number) {
  const dt = Math.min(MAX_DT, Math.max(0, deltaTime / 1000));
  lenis?.raf(time * 1000);
  ScrollTrigger.update();
  writeState(time, dt);

  // The engine keeps rendering behind the content after launch, so R3F always advances.
  advanceFn?.(time * 1000);

  for (const cb of frameCallbacks) cb(dt);
}

export function startLoop(): () => void {
  if (typeof window === "undefined") return () => {};
  ensurePlugins();
  refCount += 1;
  if (refCount === 1) {
    lenis = new Lenis({
      autoRaf: false,
      lerp: 0.08,
      syncTouch: false,
      anchors: true,
    });
    gsap.ticker.add(tick);
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    refCount -= 1;
    if (refCount === 0) {
      gsap.ticker.remove(tick);
      lenis?.destroy();
      lenis = null;
    }
  };
}

export function getLenis(): Lenis | null {
  return lenis;
}

export function setAdvance(fn: Advance | null) {
  advanceFn = fn;
}

export function setHeroTrigger(st: ScrollTrigger | null) {
  heroTrigger = st;
}

export function getHeroTrigger(): ScrollTrigger | null {
  return heroTrigger;
}

export function setContentTrigger(st: ScrollTrigger | null) {
  contentTrigger = st;
}

export function getContentTrigger(): ScrollTrigger | null {
  return contentTrigger;
}

/** Write both progress fields at once (handoff, debug). Readers see the value next tick. */
export function snapProgress(p: number) {
  const v = Math.max(0, Math.min(1, p));
  scrollState.pRaw = v;
  scrollState.p = v;
  scrollState.explode = explodeForState(v, scrollState.q);
}

/** DOM-side per-frame work (tach, HUD). Returns an unsubscribe. */
export function onFrame(cb: FrameCallback): () => void {
  frameCallbacks.add(cb);
  return () => frameCallbacks.delete(cb);
}

/** Pin the scene clock (debug / visual tests). null resumes. */
export function freezeTime(t: number | null) {
  frozenTime = t;
  if (t !== null) scrollState.time = t;
}

export function isTimeFrozen(): boolean {
  return frozenTime !== null;
}

/** Run one tick synchronously (debug: render after a programmatic scroll without waiting a frame). */
export function tickOnce() {
  tick(gsap.ticker.time, 1000 / 60);
}

/** Scroll lock while the gate is closed. */
export function lockScroll() {
  lenis?.stop();
  document.documentElement.style.overflow = "hidden";
}

export function unlockScroll() {
  document.documentElement.style.overflow = "";
  lenis?.start();
}

/** Jump to a pixel position with no smoothing. */
export function scrollToImmediate(y: number) {
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
  else window.scrollTo(0, y);
}

/** Pixel position of the stage for a progress value. */
export function pixelForProgress(p: number): number {
  const st = heroTrigger;
  if (!st) return 0;
  return st.start + (st.end - st.start) * Math.max(0, Math.min(1, p));
}
