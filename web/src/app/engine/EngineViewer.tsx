"use client";

/*
  Engine viewer: orbit the real Tomaso V8 and slide it between exploded and assembled.
  Dev route only. Reads the per-part `explode` offsets written into the glb's node extras.
*/

import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, OrbitControls, useGLTF } from "@react-three/drei";
import { token } from "@/lib/tokens";

const MODELS = {
  desktop: "/models/engine-v2.glb",
  mobile: "/models/engine-v2-mobile.glb",
} as const;
const DRACO = "/draco/";
const HDRS = ["machine_shop_01"] as const;

type Shared = { explode: number; spin: boolean };

type Part = { node: THREE.Object3D; rest: THREE.Vector3; offset: THREE.Vector3 };

function Engine({ url, shared }: { url: string; shared: RefObject<Shared> }) {
  const { scene } = useGLTF(url, DRACO);
  const group = useRef<THREE.Group>(null);

  const parts = useMemo<Part[]>(() => {
    const out: Part[] = [];
    const root = scene.getObjectByName("GLTF_SceneRootNode") ?? scene;
    for (const node of root.children) {
      const e = node.userData?.explode as unknown;
      if (!Array.isArray(e) || e.length !== 3) continue;
      // Extras were written in Blender's Z-up space; glTF is Y-up: (x, y, z) -> (x, z, -y).
      const offset = new THREE.Vector3(Number(e[0]), Number(e[2]), -Number(e[1]));
      if (offset.lengthSq() < 1e-8) continue;
      out.push({ node, rest: node.position.clone(), offset });
    }
    return out;
  }, [scene]);

  useEffect(() => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
    });
  }, [scene]);

  useFrame((_, dt) => {
    const k = shared.current.explode;
    for (const p of parts) {
      p.node.position.set(p.rest.x + p.offset.x * k, p.rest.y + p.offset.y * k, p.rest.z + p.offset.z * k);
    }
    if (group.current && shared.current.spin) group.current.rotation.y += dt * 0.25;
  });

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
}

function Lights() {
  return (
    <>
      <spotLight position={[1.6, 2.2, -0.8]} angle={0.5} penumbra={0.8} intensity={14} color={token.text()} decay={2} distance={8} castShadow />
      <directionalLight position={[-2, 0.5, 1.8]} intensity={1.2} color={token.ember()} />
      <directionalLight position={[-0.8, -1, -1]} intensity={0.5} color={token.muted()} />
    </>
  );
}

export function EngineViewer() {
  const [explode, setExplode] = useState(0);
  const [spin, setSpin] = useState(true);
  const [hdr, setHdr] = useState<(typeof HDRS)[number]>(HDRS[0]);
  const [envIntensity, setEnvIntensity] = useState(0.45);
  const [model, setModel] = useState<keyof typeof MODELS>("desktop");
  const shared = useRef<Shared>({ explode: 0, spin: true });
  useEffect(() => {
    shared.current.explode = explode;
    shared.current.spin = spin;
  }, [explode, spin]);

  return (
    <div className="fixed inset-0 bg-background">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 34, near: 0.03, far: 30, position: [1.4, 0.55, 1.6] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
        }}
      >
        <color attach="background" args={[token.background()]} />
        <fogExp2 attach="fog" args={[token.background(), 0.18]} />
        <Lights />
        <Suspense fallback={null}>
          <Environment files={`/hdr/${hdr}_1k.hdr`} environmentIntensity={envIntensity} />
          <Engine url={MODELS[model]} shared={shared} />
        </Suspense>
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={0.4} maxDistance={6} target={[0, 0, 0]} />
      </Canvas>

      <form
        className="absolute left-4 bottom-4 flex flex-col gap-3 bg-surface/90 border border-border p-4 label-mono text-muted"
        style={{ zIndex: 10, minWidth: 280 }}
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="flex flex-col gap-1">
          <span>
            Explode <span className="text-text">{explode.toFixed(2)}</span>
          </span>
          <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1">
          <span>
            Environment <span className="text-text">{envIntensity.toFixed(2)}</span>
          </span>
          <input type="range" min={0} max={2} step={0.05} value={envIntensity} onChange={(e) => setEnvIntensity(Number(e.target.value))} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>HDRI</span>
          <select className="bg-elevated text-text px-2 py-1" value={hdr} onChange={(e) => setHdr(e.target.value as (typeof HDRS)[number])}>
            {HDRS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>Model</span>
          <select className="bg-elevated text-text px-2 py-1" value={model} onChange={(e) => setModel(e.target.value as keyof typeof MODELS)}>
            <option value="desktop">desktop (479k tris)</option>
            <option value="mobile">mobile (341k tris)</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>Spin</span>
          <input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} />
        </label>
        <p className="text-subtle m-0">Drag to orbit. Scroll to zoom.</p>
      </form>
    </div>
  );
}

useGLTF.preload(MODELS.desktop, DRACO);
