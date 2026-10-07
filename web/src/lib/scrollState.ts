/*
  Mutable scroll state. ONE plain object. GSAP / the loop write, useFrame reads.
  Nothing in here is React state: zero re-renders per frame.

  Interface contract for Track C (shaders). Uniform-ready numbers, written once per tick:
    p           0..1   stage scroll progress, smoothed (the value every reader uses)
    pRaw        0..1   stage scroll progress straight from ScrollTrigger (loop.ts smooths it into p)
    q           0..1   content scroll progress after the stage (engine idles, dims, turns)
    explode     0..1   explode amount from scrollMap.explodeForProgress(p)
    rpm         0..7400 engine speed. 0 before ignition, 800 at idle, 7400 at the limiter
    combustion  0..1   flash intensity of the firing cylinder (1 at the start of each firing window, decays)
    fog         0..1   exhaust fog amount, ramps with rpm (0 at idle, 1 at the limiter)
    launch      0..1   launch beat progress, mapped over p 0.92..1 (0 elsewhere)
    time        s      scene clock. Advances with the loop; `window.__lc.freezeTime(t)` pins it.
  Extra, non-uniform fields the HUD / rig read:
    phase       gate state machine value (mirror of phase.ts for cheap reads in useFrame)
    beat        current beat id from scrollMap
    ignition    0..1 progress of the time-based ignition timeline
    crankAngle  rad, integrated every frame (angle += rpm·dt), never scrubbed
    cylinder    1..8 currently firing cylinder
    temp        0..100 mapped heat value for the HUD (no unit)
    dt          s, last frame delta (clamped)
*/

import type { BeatId } from "@/content/site";
import type { Phase } from "./phase";

export type ScrollState = {
  p: number;
  pRaw: number;
  q: number;
  explode: number;
  rpm: number;
  combustion: number;
  fog: number;
  launch: number;
  time: number;
  phase: Phase;
  beat: BeatId;
  ignition: number;
  crankAngle: number;
  cylinder: number;
  temp: number;
  dt: number;
};

export const scrollState: ScrollState = {
  p: 0,
  pRaw: 0,
  q: 0,
  explode: 0,
  rpm: 0,
  combustion: 0,
  fog: 0,
  launch: 0,
  time: 0,
  phase: "loading",
  beat: "idle",
  ignition: 0,
  crankAngle: 0,
  cylinder: 1,
  temp: 0,
  dt: 0,
};
