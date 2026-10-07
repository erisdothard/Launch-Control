/*
  ExplodeRig: slides the engine's parts between assembled and exploded.

  The glb's scene-root children carry their exploded offset as node extras (`explode: [x,y,z]`),
  written by tools/blender during reassembly in Blender's Z-up space. glTF is Y-up, so the
  offset maps (x, y, z) -> (x, z, -y). Rest positions (assembled) are read once at load.

  Only the 64 scene-root children are written (piston holders included). Pistons and the crank
  are children of those and are driven by EngineRig, so the two rigs never touch the same node.
*/

import * as THREE from "three";
import { EXPLODE_AMPLITUDE, partExplode } from "@/lib/scrollMap";

export const SCENE_ROOT_NAME = "GLTF_SceneRootNode";

type Part = {
  node: THREE.Object3D;
  rest: THREE.Vector3;
  offset: THREE.Vector3;
  /** 0 nearest the block, 1 outermost. Drives the stagger. */
  rank: number;
};

export class ExplodeRig {
  readonly parts: readonly Part[];
  /** Largest offset length, in model units. */
  readonly reach: number;
  private current = -1;

  constructor(root: THREE.Object3D) {
    const sceneRoot = root.getObjectByName(SCENE_ROOT_NAME) ?? root;
    const raw: Array<Omit<Part, "rank">> = [];
    for (const node of sceneRoot.children) {
      const e = node.userData?.explode as unknown;
      if (!Array.isArray(e) || e.length !== 3) continue;
      const offset = new THREE.Vector3(Number(e[0]), Number(e[2]), -Number(e[1]));
      if (!Number.isFinite(offset.lengthSq()) || offset.lengthSq() < 1e-8) continue;
      raw.push({ node, rest: node.position.clone(), offset });
    }
    this.reach = raw.reduce((m, p) => Math.max(m, p.offset.length()), 0);
    const max = Math.max(this.reach, 1e-6);
    this.parts = raw.map((p) => ({ ...p, rank: p.offset.length() / max }));
  }

  /** Apply a global explode amount 0..1 with the per-part stagger. No-op when unchanged. */
  setExplode(k: number) {
    const amount = k < 0 ? 0 : k > 1 ? 1 : k;
    if (amount === this.current) return;
    this.current = amount;
    for (const p of this.parts) {
      const t = partExplode(amount, p.rank) * EXPLODE_AMPLITUDE;
      p.node.position.set(p.rest.x + p.offset.x * t, p.rest.y + p.offset.y * t, p.rest.z + p.offset.z * t);
    }
  }

  /** Rest pose. */
  reset() {
    this.setExplode(0);
  }
}
