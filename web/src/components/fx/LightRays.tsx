"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import raysSource from "@/shaders/rays.glsl";
import { splitShader } from "@/shaders/split";
import { HEAT, type FxState, rpmToStrength } from "./fxState";
import { registerFx } from "./fxRegistry";

export type LightRaysProps = {
  state: FxState;
  /** Where the rays start: the firing cylinder (world units). */
  origin?: [number, number, number];
  /** Direction the cone opens toward. */
  direction?: [number, number, number];
  /** Cone length and far radius. */
  length?: number;
  radius?: number;
  /** Size of the camera-facing shells at the origin. */
  shellSize?: number;
  intensity?: number;
  seed?: number;
};

const UP = new Vector3(0, 1, 0);
const SHADER = splitShader(raysSource);

export function LightRays({
  state,
  origin = [0, 0, 0],
  direction = [0, 1, 0],
  length = 2.8,
  radius = 1.0,
  shellSize = 2.4,
  intensity = 1,
  seed = 3.7,
}: LightRaysProps) {
  const groupRef = useRef<Group>(null);
  // R3F clones the `uniforms` prop per material, so each one is written every frame.
  const coneRef = useRef<ShaderMaterial>(null);
  const shellARef = useRef<ShaderMaterial>(null);
  const shellBRef = useRef<ShaderMaterial>(null);

  const quaternion = useMemo(() => {
    const dir = new Vector3(...direction).normalize();
    return new Quaternion().setFromUnitVectors(UP, dir);
  }, [direction]);

  const coneGeometry = useMemo(() => {
    const g = new CylinderGeometry(radius, 0.04, length, 48, 1, true);
    g.translate(0, length / 2, 0);
    return g;
  }, [radius, length]);
  const shellGeometry = useMemo(() => new PlaneGeometry(1, 1), []);
  useEffect(() => () => coneGeometry.dispose(), [coneGeometry]);
  useEffect(() => () => shellGeometry.dispose(), [shellGeometry]);

  const uniforms = useMemo(() => {
    const shared = {
      uTime: { value: 0 },
      uCombustion: { value: 0 },
      uIntensity: { value: intensity },
      uSeed: { value: seed },
      uHeight: { value: length },
      uShellScale: { value: shellSize },
      uEmber: { value: HEAT.ember },
      uEmberHot: { value: HEAT.emberHot },
      uWhiteHot: { value: HEAT.whiteHot },
    };
    return {
      cone: { ...shared, uBillboard: { value: 0 }, uShellIndex: { value: 0 } },
      shellA: { ...shared, uBillboard: { value: 1 }, uShellIndex: { value: 0 } },
      shellB: { ...shared, uBillboard: { value: 1 }, uShellIndex: { value: 1 } },
    };
  }, [intensity, seed, length, shellSize]);

  useEffect(() => {
    const group = groupRef.current;
    return group ? registerFx(group) : undefined;
  }, []);

  useFrame(() => {
    const group = groupRef.current;
    if (group) group.visible = state.combustion > 0.002;
    for (const ref of [coneRef, shellARef, shellBRef]) {
      const material = ref.current;
      if (!material) continue;
      material.uniforms.uTime.value = state.time;
      // Heat gain: idle fires are faint, the limiter is a furnace. rpmToStrength is 0 at idle.
      material.uniforms.uCombustion.value = state.combustion * (0.04 + 0.96 * Math.pow(rpmToStrength(state.rpm), 2));
    }
  });

  const common = {
    vertexShader: SHADER.vertex,
    fragmentShader: SHADER.fragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  };

  return (
    <group ref={groupRef} position={origin} quaternion={quaternion}>
      <mesh geometry={coneGeometry} frustumCulled={false} renderOrder={20}>
        <shaderMaterial ref={coneRef} {...common} uniforms={uniforms.cone} />
      </mesh>
      <mesh geometry={shellGeometry} frustumCulled={false} renderOrder={21}>
        <shaderMaterial ref={shellARef} {...common} uniforms={uniforms.shellA} />
      </mesh>
      <mesh geometry={shellGeometry} frustumCulled={false} renderOrder={21}>
        <shaderMaterial ref={shellBRef} {...common} uniforms={uniforms.shellB} />
      </mesh>
    </group>
  );
}
