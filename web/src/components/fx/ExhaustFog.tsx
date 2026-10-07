"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  DepthFormat,
  DepthTexture,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshDepthMaterial,
  NormalBlending,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  ShaderMaterial,
  UnsignedIntType,
  WebGLRenderTarget,
} from "three";
import fogSource from "@/shaders/fog.glsl";
import { splitShader } from "@/shaders/split";
import { FOG_LAYERS, HEAT, type FxQuality, type FxState } from "./fxState";
import { hideFx, registerFx, restoreFx } from "./fxRegistry";

export type ExhaustFogProps = {
  state: FxState;
  quality?: FxQuality;
  /** Centre of the fog volume (world units). */
  center?: [number, number, number];
  /** Horizontal spread of the billboards. */
  radius?: number;
  /** Billboard size in world units. */
  scale?: number;
  /** Soft-particle fade distance (world units). */
  soft?: number;
  /** Global alpha multiplier. */
  density?: number;
  /** Explicit layer count overrides the quality table. */
  layers?: number;
  /**
   * The depth prepass renders with one override material, which ignores per-material
   * clipping. Pass the cutaway plane(s) here so fog is not occluded by the cut-away block.
   */
  depthClippingPlanes?: Plane[];
};

const DEPTH_SCALE = 0.5;
const SHADER = splitShader(fogSource);

/* Deterministic layout so screenshots are reproducible: a tiny LCG seeded per instance. */
function lcg(seed: number): () => number {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildGeometry(count: number, radius: number, scale: number): InstancedBufferGeometry {
  const plane = new PlaneGeometry(1, 1);
  const geometry = new InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.setAttribute("position", plane.getAttribute("position"));
  geometry.setAttribute("uv", plane.getAttribute("uv"));
  geometry.instanceCount = count;

  const offsets = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const seeds = new Float32Array(count);
  const rand = lcg(7);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.8;
    const r = radius * (0.35 + 0.65 * rand());
    offsets[i * 3] = Math.cos(a) * r;
    offsets[i * 3 + 1] = (rand() - 0.3) * radius * 0.6;
    offsets[i * 3 + 2] = Math.sin(a) * r;
    scales[i] = scale * (0.8 + 0.7 * rand());
    seeds[i] = rand();
  }
  geometry.setAttribute("aOffset", new InstancedBufferAttribute(offsets, 3));
  geometry.setAttribute("aScale", new InstancedBufferAttribute(scales, 1));
  geometry.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 1));
  return geometry;
}

function buildDepthTarget(width: number, height: number): WebGLRenderTarget {
  const depthTexture = new DepthTexture(width, height);
  depthTexture.format = DepthFormat;
  depthTexture.type = UnsignedIntType;
  return new WebGLRenderTarget(width, height, { depthTexture, depthBuffer: true, stencilBuffer: false });
}

function buildUniforms(density: number, soft: number) {
  return {
    uTime: { value: 0 },
    uFog: { value: 0 },
    uDensity: { value: density },
    uDepth: { value: null as DepthTexture | null },
    uHasDepth: { value: 0 },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 100 },
    uSoft: { value: soft },
    uSteel: { value: HEAT.fogSteel },
    uEmber: { value: HEAT.ember },
  };
}

export function ExhaustFog({
  state,
  quality = "high",
  center = [0, 0, 0],
  radius = 2.2,
  scale = 3.6,
  soft = 1.2,
  density = 1,
  layers,
  depthClippingPlanes,
}: ExhaustFogProps) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<ShaderMaterial>(null);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const useDepth = quality !== "low";
  const count = layers ?? FOG_LAYERS[quality];

  const geometry = useMemo(() => buildGeometry(count, radius, scale), [count, radius, scale]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(() => buildUniforms(density, soft), [density, soft]);

  const depthWidth = Math.max(1, Math.floor(size.width * dpr * DEPTH_SCALE));
  const depthHeight = Math.max(1, Math.floor(size.height * dpr * DEPTH_SCALE));
  const depthTarget = useMemo(
    () => (useDepth ? buildDepthTarget(depthWidth, depthHeight) : null),
    [useDepth, depthWidth, depthHeight],
  );
  useEffect(() => () => depthTarget?.dispose(), [depthTarget]);

  const depthMaterial = useMemo(
    () => new MeshDepthMaterial({ clippingPlanes: depthClippingPlanes ?? null }),
    [depthClippingPlanes],
  );
  useEffect(() => () => depthMaterial.dispose(), [depthMaterial]);

  useEffect(() => {
    const mesh = meshRef.current;
    return mesh ? registerFx(mesh) : undefined;
  }, []);

  useFrame(({ gl, scene, camera }) => {
    const material = materialRef.current;
    const mesh = meshRef.current;
    if (!material || !mesh) return;
    const u = material.uniforms;
    u.uTime.value = state.time;
    u.uFog.value = state.fog;
    mesh.visible = state.fog > 0.003;

    if (camera instanceof PerspectiveCamera) {
      u.uCameraNear.value = camera.near;
      u.uCameraFar.value = camera.far;
    }

    if (!depthTarget || !mesh.visible) {
      u.uHasDepth.value = 0;
      return;
    }

    // Opaque-only depth prepass at half resolution for the soft-particle fade.
    hideFx();
    const previousOverride = scene.overrideMaterial;
    scene.overrideMaterial = depthMaterial;
    gl.setRenderTarget(depthTarget);
    gl.clear(true, true, false);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    scene.overrideMaterial = previousOverride;
    restoreFx();

    u.uDepth.value = depthTarget.depthTexture;
    u.uHasDepth.value = 1;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} position={center} frustumCulled={false} renderOrder={10}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={SHADER.vertex}
        fragmentShader={SHADER.fragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={NormalBlending}
      />
    </mesh>
  );
}
