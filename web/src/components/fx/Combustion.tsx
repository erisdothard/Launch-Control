"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BackSide, CylinderGeometry, PointLight, ShaderMaterial } from "three";
import combustionSource from "@/shaders/combustion.glsl";
import { splitShader } from "@/shaders/split";
import { HEAT, type FxState } from "./fxState";

/**
 * Emissive flash material for the firing cylinder interior.
 * Track B can attach this to its own bore mesh and call `updateCombustionMaterial` per frame,
 * or drop `<CombustionFlash/>` in for a self-contained bore + point light.
 */
export function createCombustionMaterial(seed = 1): ShaderMaterial {
  const { vertex, fragment } = splitShader(combustionSource);
  return new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    side: BackSide,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uCombustion: { value: 0 },
      uSeed: { value: seed },
      uEmber: { value: HEAT.ember },
      uEmberHot: { value: HEAT.emberHot },
      uWhiteHot: { value: HEAT.whiteHot },
      uSteel: { value: HEAT.steel },
    },
  });
}

export function updateCombustionMaterial(material: ShaderMaterial, state: FxState): void {
  material.uniforms.uTime.value = state.time;
  material.uniforms.uCombustion.value = state.combustion;
}

export type CombustionFlashProps = {
  state: FxState;
  position?: [number, number, number];
  radius?: number;
  height?: number;
  seed?: number;
  /** Point light power at combustion = 1 (candela-ish, physically correct lights). */
  lightPower?: number;
};

export function CombustionFlash({
  state,
  position = [0, 0, 0],
  radius = 0.42,
  height = 1.1,
  seed = 1,
  lightPower = 40,
}: CombustionFlashProps) {
  const lightRef = useRef<PointLight>(null);
  const material = useMemo(() => createCombustionMaterial(seed), [seed]);
  const geometry = useMemo(() => new CylinderGeometry(radius, radius, height, 32, 1, true), [radius, height]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    updateCombustionMaterial(material, state);
    const light = lightRef.current;
    if (!light) return;
    const c = state.combustion;
    // Flicker on the light too, so the block breathes with the bore.
    const flick = 0.85 + 0.15 * Math.sin(state.time * 23 + seed);
    light.intensity = lightPower * c * c * flick;
    light.color.lerpColors(HEAT.ember, HEAT.emberHot, c);
  });

  return (
    <group position={position}>
      <mesh geometry={geometry} material={material} />
      <pointLight ref={lightRef} intensity={0} distance={9} decay={2} />
    </group>
  );
}
