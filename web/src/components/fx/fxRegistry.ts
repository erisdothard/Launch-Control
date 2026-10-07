import type { Object3D } from "three";

/**
 * Transparent FX objects register here so the fog's depth prepass can hide them
 * (they must never write into the soft-particle depth texture).
 */
const registry = new Set<Object3D>();
const hidden: Object3D[] = [];

export function registerFx(object: Object3D): () => void {
  registry.add(object);
  return () => {
    registry.delete(object);
  };
}

/** Hide every registered FX object that is currently visible. Call restoreFx() after the pass. */
export function hideFx(): void {
  hidden.length = 0;
  for (const object of registry) {
    if (object.visible) {
      object.visible = false;
      hidden.push(object);
    }
  }
}

export function restoreFx(): void {
  for (let i = 0; i < hidden.length; i++) hidden[i].visible = true;
  hidden.length = 0;
}
