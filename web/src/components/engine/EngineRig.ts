/*
  EngineRig: drives named nodes with slider-crank kinematics.
  Works on any Object3D tree that exposes the engineContract node names, so the procedural
  placeholder and the real glTF are interchangeable.

  Conventions (engine local space):
    - crank axis = +Z (cylinders are spaced along Z)
    - each cylinder bank is a child group rotated about Z by its bank angle; inside it the
      cylinder axis is local +Y, so a piston's position.y is the slider-crank displacement
    - rods are pivoted at the piston pin (position = piston position, rotation.z = -phi)
    - the crank rotates about Z: rotation.z = crankAngle
*/

import * as THREE from "three";
import {
  CRANK_NODE,
  CYLINDER_COUNT,
  cylinderCrankAngle,
  pistonNode,
  rodNode,
  sliderCrank,
  STATIC_NODES,
} from "@/lib/engine/engineContract";

export type RigNodes = {
  crank: THREE.Object3D;
  pistons: THREE.Object3D[];
  rods: THREE.Object3D[];
  heads: { L: THREE.Object3D | null; R: THREE.Object3D | null };
  block: THREE.Object3D | null;
};

export class EngineRig {
  readonly nodes: RigNodes;
  readonly missing: string[];
  /** set per cylinder by the owner (placeholder: emissive flash), 1-based index */
  private pistonY0: number[];

  constructor(root: THREE.Object3D) {
    const missing: string[] = [];
    const find = (name: string) => {
      const n = root.getObjectByName(name);
      if (!n) missing.push(name);
      return n ?? null;
    };
    const crank = find(CRANK_NODE) ?? new THREE.Object3D();
    const pistons: THREE.Object3D[] = [];
    const rods: THREE.Object3D[] = [];
    for (let i = 1; i <= CYLINDER_COUNT; i++) {
      pistons.push(find(pistonNode(i)) ?? new THREE.Object3D());
      rods.push(find(rodNode(i)) ?? new THREE.Object3D());
    }
    const block = find(STATIC_NODES[0]);
    const headL = find(STATIC_NODES[1]);
    const headR = find(STATIC_NODES[2]);
    this.nodes = { crank, pistons, rods, heads: { L: headL, R: headR }, block };
    this.missing = missing;
    this.pistonY0 = pistons.map((p) => p.position.y);
  }

  /** Drive every moving part from one crank angle (radians). Pure kinematics, no integration. */
  setCrankAngle(theta: number) {
    const { crank, pistons, rods } = this.nodes;
    crank.rotation.z = theta;
    for (let i = 0; i < CYLINDER_COUNT; i++) {
      const cyl = i + 1;
      const { y, phi } = sliderCrank(cylinderCrankAngle(cyl, theta));
      const piston = pistons[i];
      const rod = rods[i];
      piston.position.y = y;
      rod.position.y = y;
      rod.rotation.z = -phi;
    }
  }

  /** Lift the heads off the block (exploded-view hint), metres. */
  setHeadLift(metres: number) {
    const { L, R } = this.nodes.heads;
    if (L) L.position.y = (L.userData.y0 ?? 0) + metres;
    if (R) R.position.y = (R.userData.y0 ?? 0) + metres;
  }

  /** Rest pose: every piston at its original height. */
  reset() {
    this.nodes.pistons.forEach((p, i) => (p.position.y = this.pistonY0[i]));
  }
}

/** Piston displacement for cylinder `cyl` at the given crank angle (helper for materials). */
export function pistonTravel01(cyl: number, theta: number, tdc: number, bdc: number): number {
  const { y } = sliderCrank(cylinderCrankAngle(cyl, theta));
  return (y - bdc) / (tdc - bdc);
}
