"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, Noise, ToneMapping } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode, type DepthOfFieldEffect } from "postprocessing";
import type { Mesh, Plane } from "three";
import { scrollState } from "@/lib/scrollState";
import { Distortion, DistortionEffect } from "./Distortion";
import { ExhaustFog } from "./ExhaustFog";
import { LightRays } from "./LightRays";
import { LaunchPoints } from "./LaunchPoints";
import { launchToFlash, rpmToStrength, type FxQuality, type FxState } from "./fxState";

export type { FxQuality, FxState } from "./fxState";
export { createFxState } from "./fxState";
export { CombustionFlash, createCombustionMaterial, updateCombustionMaterial } from "./Combustion";
export { ExhaustFog, LightRays, LaunchPoints, Distortion, DistortionEffect };

export type EffectsProps = {
  /**
   * The per-frame uniform object `{ p, rpm, combustion, fog, launch, time }` (see fxState.ts).
   * Defaults to `scrollState` from `@/lib/scrollState`; the lab passes its own. Read in
   * useFrame, never through React state.
   */
  state?: FxState;
  quality?: FxQuality;
  /** Firing cylinder position and the direction its rays open toward (world units). */
  fireOrigin?: [number, number, number];
  fireDirection?: [number, number, number];
  /** Fog volume centre, spread and alpha multiplier. */
  fogCenter?: [number, number, number];
  fogRadius?: number;
  fogDensity?: number;
  /** The cutaway clipping plane(s), so the fog's depth prepass honours the cut. */
  depthClippingPlanes?: Plane[];
  /** Engine surface to dissolve at launch (the Mesh instance, not a ref). Omit to skip the points pass. */
  pointsMesh?: Mesh | null;
  /** Set false if the DOM owns the launch white-out. */
  whiteout?: boolean;
  /** Bloom tuning. Threshold 1.0 keeps lit steel below the bloom, only emissives bloom. */
  bloomIntensity?: number;
  bloomThreshold?: number;
  /**
   * Depth of field (high tier only; its passes run every frame regardless of bokeh, so it is
   * mounted once and never toggled per frame). Focus follows `focusDistance()` in world units.
   */
  dof?: boolean;
  focusDistance?: () => number;
  /** Film grain opacity, 0 disables. */
  grain?: number;
};

/**
 * The whole FX layer: scene-space fog, rays and launch points plus one EffectComposer
 * (Distortion + Bloom + ACES tone mapping merged into a single pass).
 */
export function Effects({
  state = scrollState,
  quality = "high",
  fireOrigin = [0, 0.6, 0],
  fireDirection = [0, 1, 0],
  fogCenter = [0, -0.4, 0],
  fogRadius = 2.4,
  fogDensity = 1,
  depthClippingPlanes,
  pointsMesh = null,
  whiteout = true,
  bloomIntensity = 0.7,
  bloomThreshold = 1.0,
  dof = false,
  focusDistance,
  grain = 0,
}: EffectsProps) {
  const distortionRef = useRef<DistortionEffect>(null);
  const dofRef = useRef<DepthOfFieldEffect>(null);
  const distortion = quality !== "low";

  useFrame(() => {
    const effect = distortionRef.current;
    if (effect) {
      effect.strength = rpmToStrength(state.rpm);
      effect.flash = whiteout ? launchToFlash(state.launch) : 0;
      effect.time = state.time;
    }
    const d = dofRef.current;
    if (d && focusDistance) {
      // Shallow only while the stack is open (dive beat); otherwise a wide, near-invisible focus.
      const open = state.p > 0.12 && state.p < 0.62 ? 1 : 0;
      d.cocMaterial.worldFocusDistance = focusDistance();
      d.cocMaterial.worldFocusRange = open ? 0.35 : 3.0;
      d.bokehScale = open ? 2.4 : 0.6;
    }
  });

  return (
    <>
      <ExhaustFog
        state={state}
        quality={quality}
        center={fogCenter}
        radius={fogRadius}
        density={fogDensity}
        depthClippingPlanes={depthClippingPlanes}
      />
      <LightRays state={state} origin={fireOrigin} direction={fireDirection} length={1.3} radius={0.42} shellSize={0.9} />
      {pointsMesh ? <LaunchPoints state={state} mesh={pointsMesh} quality={quality} streak={2.4} size={2.6} /> : null}
      {/* No fragments or nulls inside the composer: it reads its children as effect instances. */}
      <EffectComposer
        multisampling={quality === "high" ? 4 : 0}
        resolutionScale={quality === "low" ? 0.75 : 1}
      >
        {[
          ...(dof ? [<DepthOfField key="dof" ref={dofRef} worldFocusDistance={1.8} worldFocusRange={3} bokehScale={0.6} />] : []),
          ...(distortion ? [<Distortion key="distortion" ref={distortionRef} />] : []),
          <Bloom
            key="bloom"
            mipmapBlur
            luminanceThreshold={bloomThreshold}
            luminanceSmoothing={0.4}
            intensity={bloomIntensity}
            radius={0.85}
            levels={quality === "high" ? 8 : 5}
          />,
          ...(grain > 0 ? [<Noise key="noise" premultiply blendFunction={BlendFunction.SCREEN} opacity={grain} />] : []),
          <ToneMapping key="tone" mode={ToneMappingMode.ACES_FILMIC} />,
        ]}
      </EffectComposer>
    </>
  );
}
