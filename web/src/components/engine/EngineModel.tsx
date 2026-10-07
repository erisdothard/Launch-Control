"use client";

/*
  EngineModel: the real V8 (Tomaso, CC BY 4.0), reassembled and exported by tools/blender.
  Loaded with Draco. Exposes the engineContract node names to EngineRig (crank + pistons) and the
  per-part explode offsets to ExplodeRig. Scene mounts it by default; the procedural placeholder
  is the fallback behind Suspense and for `?engine=placeholder`.
*/

import { forwardRef, useEffect, useImperativeHandle, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { pistonNode, TDC } from "@/lib/engine/engineContract";
import { token } from "@/lib/tokens";
import { EngineRig } from "./EngineRig";
import { ExplodeRig } from "./ExplodeRig";
import type { EngineHandle } from "./PlaceholderEngine";

export const ENGINE_GLB = "/models/engine-v2.glb";
export const ENGINE_GLB_MOBILE = "/models/engine-v2-mobile.glb";
export const DRACO_PATH = "/draco/";

export type EngineModelProps = { visible?: boolean; url?: string };

/** Scene-root part names (prefix match) that are castings. Names come from the Blender export. */
const CASTINGS = ["Block", "HeadL", "HeadR", "Priekin", "Galvos", "galvos", "tepalo", "Cylinder.000", "UZ SITO"];
const ROUGH_CASTING = 0.34;
/** Neutral silver: the palette is black, white, silver, canary. No blue cast. */
const COLD_CAST = new THREE.Color(1.0, 1.0, 1.0);

function topLevelName(o: THREE.Object3D): string {
  let n: THREE.Object3D = o;
  while (n.parent && n.parent.name !== "GLTF_SceneRootNode" && n.parent.parent) n = n.parent;
  return n.name;
}

export const EngineModel = forwardRef<EngineHandle, EngineModelProps>(function EngineModel(
  { visible = true, url = ENGINE_GLB },
  ref,
) {
  const { scene } = useGLTF(url, DRACO_PATH);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const rigs = useMemo(() => {
    const rig = new EngineRig(scene);
    rig.setCrankAngle(0);
    const explode = new ExplodeRig(scene);
    explode.reset();
    return { rig, explode };
  }, [scene]);

  const pistonMaterials = useMemo(() => {
    const pistons: THREE.MeshStandardMaterial[] = [];
    for (let c = 1; c <= 8; c++) {
      const node = scene.getObjectByName(pistonNode(c));
      let mat: THREE.MeshStandardMaterial | null = null;
      node?.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !mat) {
          const cloned = (m.material as THREE.MeshStandardMaterial).clone();
          cloned.emissive = new THREE.Color(token.ember());
          cloned.emissiveIntensity = 0;
          m.material = cloned;
          mat = cloned;
        }
      });
      pistons.push(mat ?? new THREE.MeshStandardMaterial());
    }
    return pistons;
  }, [scene]);

  // Steel reads from the environment map; no shadow maps (cost) and no frustum culling surprises
  // on a part that explodes out of its original bounds. Castings (block, heads, front casting,
  // covers, pan) get a roughness floor so they read as machined steel, not showroom chrome; the
  // headers and small hardware stay polished. Every material gets the cold cast (hue 250).
  useEffect(() => {
    const seen = new Set<THREE.Material>();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.frustumCulled = false;
      const top = topLevelName(m);
      const casting = CASTINGS.some((n) => top.startsWith(n));
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        const std = mat as THREE.MeshStandardMaterial;
        if (!("roughness" in std) || std.userData.lcTuned) continue;
        std.userData.lcTuned = true; // strict-mode double effects must not double the cast
        std.envMapIntensity = 1;
        std.color.multiply(COLD_CAST);
        if (casting) std.roughness = Math.max(std.roughness, ROUGH_CASTING);
      }
    });
  }, [scene]);

  useImperativeHandle(
    ref,
    () => ({
      get rig() {
        return rigs.rig;
      },
      get explode() {
        return rigs.explode;
      },
      get root() {
        return scene;
      },
      get sampleMesh() {
        return null;
      },
      pistonMaterials,
      clippable: [],
      clippableMoving: [],
      chamberWorld: (cyl, out) => {
        const p = scene.getObjectByName(pistonNode(cyl));
        if (!p?.parent) return out.set(0, 0, 0);
        tmp.copy(p.position);
        tmp.y = TDC + 0.03;
        return p.parent.localToWorld(out.copy(tmp));
      },
    }),
    [scene, rigs, pistonMaterials, tmp],
  );

  return <primitive object={scene} visible={visible} />;
});

useGLTF.preload(ENGINE_GLB, DRACO_PATH);
