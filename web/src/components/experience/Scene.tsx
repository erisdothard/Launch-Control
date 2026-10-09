"use client";

/*
  Scene: the R3F Canvas. frameloop="never"; Driver hands `advance` to lib/loop.ts.
  Lighting: a machine-shop HDRI for the steel, one cold key, one ember rim that grows with the
  revs, background #05080b. The firing cylinder flashes ember → ember-hot → white-hot by
  combustion intensity, attenuated while the engine is apart.
  The engine sits on a turntable group that turns slowly with time plus whatever the visitor drags
  (lib/spin.ts); scroll only moves the camera.

  Track C slot: `effects` renders inside the Canvas after the engine (postprocessing, fog, rays).
  Track C reads scrollState.{p,rpm,combustion,fog,launch,time}.
*/

import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { ScreenQuad } from "@react-three/drei";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { Effects, type FxQuality } from "@/components/fx/Effects";
import { scrollState } from "@/lib/scrollState";
import { STAGE_LIMITER_RPM, smooth } from "@/lib/scrollMap";
import { engineSpin, stepSpin } from "@/lib/spin";
import { token } from "@/lib/tokens";
import { Driver } from "./Driver";
import { CameraRig, getFocusDistance } from "./CameraRig";
import { PlaceholderEngine, type EngineHandle } from "@/components/engine/PlaceholderEngine";
import { EngineModel, ENGINE_GLB, ENGINE_GLB_MOBILE } from "@/components/engine/EngineModel";

export type EngineSource = "placeholder" | "glb";

export type SceneProps = {
  engine?: EngineSource;
  /** Track C post/FX quality tier. null renders the bare scene (tests, `?fx=off`). */
  fxQuality?: FxQuality | null;
  onContextLost?: () => void;
  onContextRestored?: () => void;
  onFirstFrame?: () => void;
};

export const HDRI_URL = "/hdr/machine_shop_01_512.hdr";
/** Environment intensity at the stage and once the content has taken over. */
const ENV_STAGE = 0.3;
const ENV_CONTENT = 0.26;
const EXPOSURE = 0.92;

/**
 * The composer tone-maps the whole frame, so a flat colour comes out darker than the token.
 * Invert the fitted ACES curve (y = x(2.51x+0.03)/(x(2.43x+0.59)+0.14)) per channel and undo
 * the exposure, so the ground and the fog land on the locked DESIGN.md values after tone mapping.
 */
function preToneMapped(hex: string): THREE.Color {
  const c = new THREE.Color(hex);
  const inv = (y: number) => {
    const a = 2.51 - 2.43 * y;
    const b = 0.03 - 0.59 * y;
    const k = -0.14 * y;
    const x = (-b + Math.sqrt(b * b - 4 * a * k)) / (2 * a);
    return Math.max(0, x) / EXPOSURE;
  };
  return new THREE.Color(inv(c.r), inv(c.g), inv(c.b));
}

/**
 * The HDRI as scene.environment, converted to a PMREM cube explicitly the moment it loads.
 * three can do this lazily inside a render pass, but on a real network (Vercel) that path
 * produced a black environment depending on which asset arrived first. Eager and explicit
 * is deterministic. Suspends on the loader, so it sits in its own Suspense.
 */
function EnvironmentMap({ url, onReady }: { url: string; onReady?: () => void }) {
  const hdr = useLoader(RGBELoader, url);
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, scene } = get();
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const target = pmrem.fromEquirectangular(hdr);
    pmrem.dispose();
    scene.environment = target.texture;
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
    });
    onReady?.();
    return () => {
      if (scene.environment === target.texture) scene.environment = null;
      target.dispose();
    };
  }, [get, hdr, onReady]);
  return null;
}

/** Cold atmosphere behind the engine: a radial lift from the ground token toward a steel tint. */
function Backdrop() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uEdge: { value: preToneMapped(token.background()) },
      uCentre: { value: preToneMapped("#121416") },
      uAspect: { value: 1.6 },
    }),
    [],
  );
  useFrame(({ size }) => {
    const m = material.current;
    if (m) m.uniforms.uAspect.value = size.width / size.height;
  });
  return (
    <ScreenQuad renderOrder={-1000}>
      <shaderMaterial
        ref={material}
        depthTest={false}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }`}
        fragmentShader={`uniform vec3 uEdge; uniform vec3 uCentre; uniform float uAspect; varying vec2 vUv;
          void main(){ vec2 d = (vUv - vec2(0.5, 0.48)) * vec2(uAspect, 1.0); float r = length(d);
          float t = smoothstep(0.08, 0.72, r); gl_FragColor = vec4(mix(uCentre, uEdge, t), 1.0); }`}
      />
    </ScreenQuad>
  );
}
/** Turntable: a slow constant turn with time. The camera path owns every scroll-driven move. */
const TURN_TIME = 0.025;
/** The engine sits right of centre, behind the hero type. */
const ENGINE_OFFSET_X = 0.36;
/** The engine is background: its combustion glow runs at a fraction of the old stage strength. */
const BACKGROUND_HEAT = 0.55;

/* Frame scratch. Module-level on purpose: one stage per page, no per-frame allocation. */
const scratch = {
  ember: new THREE.Color(),
  emberHot: new THREE.Color(),
  emberRed: new THREE.Color(),
  tmp: new THREE.Color(),
  pos: new THREE.Vector3(),
  ready: false,
};

function EngineStage({ engine, lowTier, onEngineReady }: { engine: EngineSource; lowTier: boolean; onEngineReady: () => void }) {
  const handle = useRef<EngineHandle>(null);
  const fireLight = useRef<THREE.PointLight>(null);
  const turntable = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    const h = handle.current;
    const s = scrollState;
    stepSpin(dt);
    if (turntable.current) {
      const yaw = s.time * TURN_TIME + engineSpin.yaw;
      turntable.current.rotation.y = Number.isFinite(yaw) ? yaw : 0;
      turntable.current.rotation.x = Number.isFinite(engineSpin.pitch) ? engineSpin.pitch : 0;
    }
    if (!h) return;
    const colors = scratch;
    if (!colors.ready) {
      colors.ember.set(token.ember());
      colors.emberHot.set(token.emberHot());
      colors.emberRed.set(token.emberRed());
      colors.ready = true;
    }
    h.rig?.setCrankAngle(s.crankAngle);
    h.explode?.setExplode(s.explode);

    // Combustion flash in the firing cylinder: the livery ramp, yellow → orange → red, by heat.
    const c = s.combustion;
    const rpmNorm = Math.min(1, s.rpm / STAGE_LIMITER_RPM);
    /* Colour climbs the heat ramp with the revs, not just with the firing pulse:
       yellow through the mid range, orange toward the hold, red at the top of the revs. */
    const ramp = s.phase === "igniting" ? c : c * Math.max(0, (rpmNorm - 0.35) / 0.65);
    if (ramp < 0.6) colors.tmp.lerpColors(colors.ember, colors.emberHot, ramp / 0.6);
    else colors.tmp.lerpColors(colors.emberHot, colors.emberRed, (ramp - 0.6) / 0.4);
    const firing = s.phase === "igniting" ? 1 : s.cylinder;
    /* Heat gain: idle fires are faint, the limiter is a furnace. Apart, the chambers only glow. */
    const apart = 0.4 + 0.6 * (1 - s.explode);
    const heat = (s.phase === "igniting" ? 1 : 0.1 + 0.9 * Math.pow(rpmNorm, 2.2)) * apart * BACKGROUND_HEAT;
    for (let i = 0; i < h.pistonMaterials.length; i++) {
      const m = h.pistonMaterials[i];
      const active = i + 1 === firing && c > 0.001;
      m.emissiveIntensity = active ? c * heat * (0.7 + rpmNorm * 2.0) : 0;
      if (active) m.emissive.copy(colors.tmp);
    }
    const light = fireLight.current;
    if (light) {
      h.chamberWorld(firing, colors.pos);
      light.position.copy(colors.pos);
      light.color.copy(colors.tmp);
      light.intensity = c * heat * (0.35 + rpmNorm * 1.6);
      light.distance = 0.3 + 0.85 * Math.pow(rpmNorm, 1.5);
    }
  });

  return (
    <group ref={turntable} position={[ENGINE_OFFSET_X, 0, 0]}>
      {engine === "glb" ? (
        <Suspense fallback={<PlaceholderEngine ref={handle} />}>
          <EngineModel ref={handle} url={lowTier ? ENGINE_GLB_MOBILE : ENGINE_GLB} onReady={onEngineReady} />
        </Suspense>
      ) : (
        <PlaceholderEngine ref={handle} />
      )}
      <pointLight ref={fireLight} intensity={0} distance={1.15} decay={2} />
    </group>
  );
}

function Lights({ onEnvReady }: { onEnvReady: () => void }) {
  const bg = useMemo(() => preToneMapped(token.background()), []);
  const rimRef = useRef<THREE.DirectionalLight>(null);
  const lastEnv = useRef<THREE.Texture | null>(null);
  // The ember rim is the only heat at idle, and it grows with the revs. The environment dims
  // once the content takes over (written here, never through the Environment prop).
  // Materials compiled before the HDRI arrived (cached glb, cold HDRI) must recompile for it.
  useFrame(({ scene }) => {
    const s = scrollState;
    if (scene.environment !== lastEnv.current) {
      lastEnv.current = scene.environment;
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
      });
    }
    const rim = rimRef.current;
    if (rim) {
      const n = Math.min(1, s.rpm / STAGE_LIMITER_RPM);
      rim.intensity = s.phase === "igniting" ? 0.6 : 0.15 + 0.45 * n * n;
    }
    /* Reflections calm down while the stack is apart (25% off past half explode): the HDRI glints on
       bores and headers were the thing breaking up the body copy at the peak, not the lights. */
    const calm = 1 - 0.25 * smooth((s.explode - 0.5) / 0.5);
    scene.environmentIntensity = (ENV_STAGE + (ENV_CONTENT - ENV_STAGE) * s.q) * calm;
  });
  return (
    <>
      <color attach="background" args={[bg]} />
      <fogExp2 attach="fog" args={[bg, 0.14]} />
      <Backdrop />
      {/* Own Suspense: a bare loader would suspend the Canvas boundary and stall onFirstFrame. */}
      <Suspense fallback={null}>
        <EnvironmentMap url={HDRI_URL} onReady={onEnvReady} />
      </Suspense>
      <ambientLight color={token.subtle()} intensity={0.06} />
      {/* Cold key, steel-white, upper right front. */}
      <spotLight position={[1.6, 2.0, -0.8]} angle={0.55} penumbra={0.8} intensity={0.8} color={token.text()} decay={2} distance={8} />
      {/* Cold rim from behind-left, separates the silhouette from the ground. */}
      <directionalLight position={[-1.2, 0.9, -1.6]} intensity={1.0} color="#e3e8ee" />
      {/* Ember rim, low and behind left: a thin line of heat on the edges only. */}
      <directionalLight ref={rimRef} position={[-1.6, 0.4, 1.4]} intensity={0.25} color={token.ember()} />
      <directionalLight position={[-0.6, -0.8, -0.8]} intensity={0.3} color={token.muted()} />
    </>
  );
}

/** Nothing waits longer than this for an asset before the gate opens anyway (slow networks, a 404). */
const ASSET_TIMEOUT_MS = 15000;

export function Scene({ engine = "glb", fxQuality = "high", onContextLost, onContextRestored, onFirstFrame }: SceneProps) {
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  /* The gate opens only when the engine, its environment and a rendered frame are all in. */
  const assets = useRef({ engine: engine === "placeholder", env: false, frame: false, done: false });
  const settle = useCallback(() => {
    const a = assets.current;
    if (a.done || !(a.engine && a.env && a.frame)) return;
    a.done = true;
    onFirstFrame?.();
  }, [onFirstFrame]);
  /* "Ready" means uploaded and compiled, not merely parsed: a cold load otherwise shows an empty
     stage for seconds after Start while 479k triangles and 15 materials hit the GPU. */
  const warm = useRef<(() => Promise<void>) | null>(null);
  const registerWarm = useCallback((fn: (() => Promise<void>) | null) => {
    warm.current = fn;
  }, []);
  const onEngineReady = useCallback(() => {
    const run = warm.current;
    const done = () => {
      assets.current.engine = true;
      settle();
    };
    if (run) void run().then(done, done);
    else done();
  }, [settle]);
  const onEnvReady = useCallback(() => {
    assets.current.env = true;
    settle();
  }, [settle]);
  const onFrame = useCallback(() => {
    assets.current.frame = true;
    settle();
  }, [settle]);
  useEffect(() => {
    const id = window.setTimeout(() => {
      const a = assets.current;
      if (a.done) return;
      a.engine = true;
      a.env = true;
      settle();
    }, ASSET_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [settle]);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    const el = gl.domElement;
    const lost = (e: Event) => {
      e.preventDefault();
      onContextLost?.();
    };
    const restored = () => onContextRestored?.();
    el.addEventListener("webglcontextlost", lost);
    el.addEventListener("webglcontextrestored", restored);
    return () => {
      el.removeEventListener("webglcontextlost", lost);
      el.removeEventListener("webglcontextrestored", restored);
    };
  }, [onContextLost, onContextRestored]);

  return (
    <Canvas
      frameloop="never"
      dpr={[1, 1.75]}
      camera={{ fov: 34, near: 0.03, far: 20, position: [1.44, 0.53, 1.69] }}
      gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true }}
      onCreated={(state) => {
        state.gl.toneMapping = THREE.ACESFilmicToneMapping;
        state.gl.toneMappingExposure = EXPOSURE;
        glRef.current = state.gl;
      }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
    >
      <Driver />
      <Expose />
      <Warmup register={registerWarm} />
      <Lights onEnvReady={onEnvReady} />
      <CameraRig />
      <EngineStage engine={engine} lowTier={fxQuality === "low"} onEngineReady={onEngineReady} />
      <FirstFrame onFirstFrame={onFrame} />
      {fxQuality ? (
        <Effects
          quality={fxQuality}
          state={scrollState}
          fireOrigin={[0, 0.12, 0]}
          fireDirection={[0, 1, 0]}
          fogCenter={[0, -0.45, 0]}
          fogDensity={0.15}
          bloomThreshold={1.1}
          bloomIntensity={0.45}
          dof={false}
          focusDistance={getFocusDistance}
          grain={0.035}
          whiteout={false}
        />
      ) : null}
    </Canvas>
  );
}

declare global {
  interface Window {
    __lcScene?: THREE.Scene;
    __lcCamera?: THREE.Camera;
    __lcGl?: THREE.WebGLRenderer;
  }
}

/** Hands Scene a function that compiles every shader and uploads every buffer in the scene. */
function Warmup({ register }: { register: (fn: (() => Promise<void>) | null) => void }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    register(async () => {
      const { gl, scene, camera } = get();
      await gl.compileAsync(scene, camera);
    });
    return () => register(null);
  }, [get, register]);
  return null;
}

/** Exposes the scene graph for the `?debug` hook and Playwright probes. */
function Expose() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    window.__lcScene = scene;
    window.__lcCamera = camera;
    window.__lcGl = gl;
    return () => {
      delete window.__lcScene;
      delete window.__lcCamera;
      delete window.__lcGl;
    };
  }, [scene, camera, gl]);
  return null;
}

function FirstFrame({ onFirstFrame }: { onFirstFrame: () => void }) {
  const done = useRef(false);
  // Default priority: a non-zero priority would take over rendering from R3F.
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    onFirstFrame();
  });
  return null;
}
