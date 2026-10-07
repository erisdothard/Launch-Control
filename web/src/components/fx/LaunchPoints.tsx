"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, Mesh, ShaderMaterial, Vector3 } from "three";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import morphSource from "@/shaders/morph.glsl";
import { splitShader } from "@/shaders/split";
import { HEAT, POINT_COUNT, type FxQuality, type FxState } from "./fxState";
import { registerFx } from "./fxRegistry";

export type LaunchPointsProps = {
  state: FxState;
  /**
   * Surface to sample. Pass the Mesh instance itself (hold it in state or a callback ref),
   * not a RefObject: sampling happens when this prop changes. World matrix is baked in.
   */
  mesh: Mesh | null;
  quality?: FxQuality;
  /** Overrides the quality table (120k / 60k / 35k). */
  count?: number;
  /** Base point size in CSS pixels (scaled by DPR in the shader). */
  size?: number;
  /** Streak travel toward the camera at launch = 1 (world units). */
  streak?: number;
};

type Sampled = { points: BufferGeometry; lines: BufferGeometry };

/** One streak line per LINE_STRIDE points keeps the launch legible and the buffers small. */
const LINE_STRIDE = 3;

const SHADER = splitShader(morphSource);

function sample(mesh: Mesh, count: number): Sampled {
  const sampler = new MeshSurfaceSampler(mesh).build();
  mesh.updateWorldMatrix(true, false);
  const p = new Vector3();

  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const ends = new Float32Array(count).fill(1);
  const lineCount = Math.ceil(count / LINE_STRIDE);
  const linePositions = new Float32Array(lineCount * 6);
  const lineSeeds = new Float32Array(lineCount * 2);
  const lineEnds = new Float32Array(lineCount * 2);

  for (let i = 0; i < count; i++) {
    sampler.sample(p);
    p.applyMatrix4(mesh.matrixWorld);
    const seed = (i * 0.618033988749895) % 1;
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
    seeds[i] = seed;
    if (i % LINE_STRIDE !== 0) continue;
    const li = i / LINE_STRIDE;
    for (let k = 0; k < 2; k++) {
      const j = li * 2 + k;
      linePositions[j * 3] = p.x;
      linePositions[j * 3 + 1] = p.y;
      linePositions[j * 3 + 2] = p.z;
      lineSeeds[j] = seed;
      lineEnds[j] = k;
    }
  }

  const points = new BufferGeometry();
  points.setAttribute("position", new BufferAttribute(positions, 3));
  points.setAttribute("aSeed", new BufferAttribute(seeds, 1));
  points.setAttribute("aEnd", new BufferAttribute(ends, 1));

  const lines = new BufferGeometry();
  lines.setAttribute("position", new BufferAttribute(linePositions, 3));
  lines.setAttribute("aSeed", new BufferAttribute(lineSeeds, 1));
  lines.setAttribute("aEnd", new BufferAttribute(lineEnds, 1));

  return { points, lines };
}

export function LaunchPoints({ state, mesh, quality = "high", count, size = 2.2, streak = 34 }: LaunchPointsProps) {
  const groupRef = useRef<Group>(null);
  // R3F clones the `uniforms` prop per material, so both are written every frame.
  const pointsMaterialRef = useRef<ShaderMaterial>(null);
  const linesMaterialRef = useRef<ShaderMaterial>(null);
  const total = count ?? POINT_COUNT[quality];

  const uniforms = useMemo(() => {
    const shared = {
      uLaunch: { value: 0 },
      uPixelRatio: { value: 1 },
      uSize: { value: size },
      uStreak: { value: streak },
      uEmber: { value: HEAT.ember },
      uEmberHot: { value: HEAT.emberHot },
      uWhiteHot: { value: HEAT.whiteHot },
    };
    return { points: { ...shared, uLine: { value: 0 } }, lines: { ...shared, uLine: { value: 1 } } };
  }, [size, streak]);

  const sampled = useMemo(() => (mesh ? sample(mesh, total) : null), [mesh, total]);
  useEffect(
    () => () => {
      sampled?.points.dispose();
      sampled?.lines.dispose();
    },
    [sampled],
  );

  useEffect(() => {
    const group = groupRef.current;
    return group ? registerFx(group) : undefined;
  }, [sampled]);

  useFrame(({ gl }) => {
    const group = groupRef.current;
    if (group) group.visible = state.launch > 0.001;
    const dpr = gl.getPixelRatio();
    for (const ref of [pointsMaterialRef, linesMaterialRef]) {
      const material = ref.current;
      if (!material) continue;
      material.uniforms.uLaunch.value = state.launch;
      material.uniforms.uPixelRatio.value = dpr;
    }
  });

  if (!sampled) return null;

  const common = {
    vertexShader: SHADER.vertex,
    fragmentShader: SHADER.fragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  };

  return (
    <group ref={groupRef} visible={false}>
      <points geometry={sampled.points} frustumCulled={false} renderOrder={30}>
        <shaderMaterial ref={pointsMaterialRef} {...common} uniforms={uniforms.points} />
      </points>
      <lineSegments geometry={sampled.lines} frustumCulled={false} renderOrder={31}>
        <shaderMaterial ref={linesMaterialRef} {...common} uniforms={uniforms.lines} />
      </lineSegments>
    </group>
  );
}
