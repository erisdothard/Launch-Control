"use client";

/*
  PlaceholderEngine: a cross-plane V8 built from primitives, honouring engineContract node names.
  Block, two banks at 90°, crank with four throws and counterweights, 8 pistons, 8 rods,
  heads that lift for the exploded hint, exhaust headers, flywheel, pulley.
  Engine local space: crank axis = Z, banks rotated about Z by ±45°, cylinder axis = bank-local +Y.
*/

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  bankAngleRad,
  bankOf,
  CRANK_NODE,
  CYLINDER_COUNT,
  ENGINE_GEOMETRY,
  pistonNode,
  rodNode,
  STATIC_NODES,
  TDC,
} from "@/lib/engine/engineContract";
import { token } from "@/lib/tokens";
import { EngineRig } from "./EngineRig";
import type { ExplodeRig } from "./ExplodeRig";

export type EngineHandle = {
  rig: EngineRig | null;
  /** present on the real glb only; the placeholder has nothing to explode */
  explode?: ExplodeRig | null;
  /** per-cylinder piston materials, 1-based index minus one */
  pistonMaterials: THREE.MeshStandardMaterial[];
  /** static materials the cutaway clipping plane applies to */
  clippable: THREE.Material[];
  /** moving-part materials clipped slightly further out (pistons, rods, crank) */
  clippableMoving: THREE.Material[];
  /** world-space position of a cylinder's combustion chamber, written into `out` */
  chamberWorld: (cyl: number, out: THREE.Vector3) => THREE.Vector3;
  /** the largest static mesh, sampled by the launch particle morph */
  sampleMesh: THREE.Mesh | null;
  /** the engine root, hidden once the launch particles have taken over */
  root: THREE.Object3D | null;
};

const G = ENGINE_GEOMETRY;
const JOURNAL_Z = [0, 1, 2, 3].map((j) => G.cylinderPitch * (j - 1.5));
/** rods on one journal sit side by side */
const ROD_OFFSET = 0.016;
const ENGINE_LENGTH = G.cylinderPitch * 4 + 0.08;
const SLEEVE_BOTTOM = 0.12;
const SLEEVE_TOP = TDC + 0.035;
const HEAD_HEIGHT = 0.055;

const cylinderZ = (cyl: number) =>
  JOURNAL_Z[G.cylinderJournal[cyl - 1]] + (bankOf(cyl) === "L" ? -ROD_OFFSET : ROD_OFFSET);

function makeMaterials() {
  // No environment map in the scene, so metalness stays moderate or the steel reads as black.
  const steelDark = new THREE.MeshStandardMaterial({
    color: token.border(),
    metalness: 0.45,
    roughness: 0.55,
  });
  const steelMid = new THREE.MeshStandardMaterial({
    color: token.subtle(),
    metalness: 0.5,
    roughness: 0.45,
  });
  const steelLight = new THREE.MeshStandardMaterial({
    color: token.muted(),
    metalness: 0.55,
    roughness: 0.35,
  });
  const bore = new THREE.MeshStandardMaterial({
    color: token.elevated(),
    metalness: 0.3,
    roughness: 0.7,
    side: THREE.BackSide,
  });
  return { steelDark, steelMid, steelLight, bore };
}

export const PlaceholderEngine = forwardRef<EngineHandle, { visible?: boolean }>(function PlaceholderEngine(
  { visible = true },
  ref,
) {
  const root = useRef<THREE.Group>(null);
  const rigRef = useRef<EngineRig | null>(null);
  const mats = useMemo(makeMaterials, []);
  const pistonMaterials = useMemo(
    () =>
      Array.from({ length: CYLINDER_COUNT }, () => {
        const m = mats.steelLight.clone();
        m.emissive = new THREE.Color(token.ember());
        m.emissiveIntensity = 0;
        return m;
      }),
    [mats],
  );
  const clippable = useMemo(() => [mats.steelDark, mats.bore], [mats]);
  const clippableMoving = useMemo(() => [mats.steelMid, mats.steelLight, ...pistonMaterials], [mats, pistonMaterials]);

  const geo = useMemo(() => {
    const r = G.crankRadius;
    return {
      shaft: new THREE.CylinderGeometry(0.024, 0.024, ENGINE_LENGTH + 0.06, 24),
      pin: new THREE.CylinderGeometry(0.02, 0.02, 0.06, 20),
      web: new THREE.BoxGeometry(0.05, r + 0.03, 0.018),
      counter: new THREE.CylinderGeometry(0.075, 0.075, 0.018, 24, 1, false, Math.PI * 0.15, Math.PI * 0.7),
      piston: new THREE.CylinderGeometry(G.bore / 2 - 0.003, G.bore / 2 - 0.003, 0.06, 32),
      pin2: new THREE.CylinderGeometry(0.012, 0.012, G.bore - 0.01, 12),
      rod: new THREE.BoxGeometry(0.028, G.rodLength, 0.016),
      bigEnd: new THREE.CylinderGeometry(0.03, 0.03, 0.03, 20),
      sleeve: new THREE.CylinderGeometry(G.bore / 2 + 0.008, G.bore / 2 + 0.008, SLEEVE_TOP - SLEEVE_BOTTOM, 32, 1, true),
      boreIn: new THREE.CylinderGeometry(G.bore / 2, G.bore / 2, SLEEVE_TOP - SLEEVE_BOTTOM, 32, 1, true),
      bankBlock: new THREE.BoxGeometry(G.bore + 0.05, SLEEVE_TOP - SLEEVE_BOTTOM, ENGINE_LENGTH - 0.02),
      crankcase: new THREE.BoxGeometry(0.28, 0.17, ENGINE_LENGTH),
      pan: new THREE.BoxGeometry(0.22, 0.06, ENGINE_LENGTH - 0.04),
      head: new THREE.BoxGeometry(G.bore + 0.07, HEAD_HEIGHT, ENGINE_LENGTH - 0.02),
      camCover: new THREE.BoxGeometry(G.bore + 0.03, 0.03, ENGINE_LENGTH - 0.06),
      header: new THREE.CylinderGeometry(0.018, 0.02, 0.16, 14),
      flywheel: new THREE.CylinderGeometry(0.14, 0.14, 0.022, 48),
      pulley: new THREE.CylinderGeometry(0.075, 0.075, 0.028, 32),
      valley: new THREE.BoxGeometry(0.12, 0.02, ENGINE_LENGTH - 0.06),
    };
  }, []);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const rig = new EngineRig(node);
    rig.setCrankAngle(0);
    rigRef.current = rig;
    return () => {
      rigRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
      pistonMaterials.forEach((m) => m.dispose());
    };
  }, [geo, mats, pistonMaterials]);

  const tmp = useMemo(() => new THREE.Vector3(), []);
  const crankcaseRef = useRef<THREE.Mesh>(null);
  useImperativeHandle(
    ref,
    () => ({
      get rig() {
        return rigRef.current;
      },
      get sampleMesh() {
        return crankcaseRef.current;
      },
      get root() {
        return root.current;
      },
      pistonMaterials,
      clippable,
      clippableMoving,
      chamberWorld: (cyl, out) => {
        const bank = root.current?.getObjectByName(`Bank${bankOf(cyl)}`);
        if (!bank) return out.set(0, 0, 0);
        tmp.set(0, TDC + 0.03, cylinderZ(cyl));
        return bank.localToWorld(out.copy(tmp));
      },
    }),
    [pistonMaterials, clippable, clippableMoving, tmp],
  );

  const banks: Array<"L" | "R"> = ["L", "R"];

  return (
    <group ref={root} name="Engine" visible={visible}>
      {/* Block: crankcase + pan + valley + per-bank cylinder housing. Static. */}
      <group name={STATIC_NODES[0]}>
        <mesh ref={crankcaseRef} geometry={geo.crankcase} material={mats.steelDark} position={[0, 0.02, 0]} />
        <mesh geometry={geo.pan} material={mats.steelMid} position={[0, -0.09, 0]} />
        <mesh geometry={geo.valley} material={mats.steelMid} position={[0, 0.12, 0]} />
        {banks.map((b) => {
          const angle = bankAngleRad(b === "L" ? 1 : 2);
          const out = b === "L" ? 1 : -1;
          const cyls = Array.from({ length: 4 }, (_, k) => (b === "L" ? 1 : 2) + k * 2);
          return (
            <group key={b} rotation={[0, 0, angle]}>
              <mesh
                geometry={geo.bankBlock}
                material={mats.steelDark}
                position={[0, (SLEEVE_TOP + SLEEVE_BOTTOM) / 2 - 0.03, 0]}
              />
              {cyls.map((c) => (
                <group key={c} position={[0, (SLEEVE_TOP + SLEEVE_BOTTOM) / 2, cylinderZ(c)]}>
                  <mesh geometry={geo.sleeve} material={mats.steelMid} />
                  <mesh geometry={geo.boreIn} material={mats.bore} />
                </group>
              ))}
              {cyls.map((c) => (
                <mesh
                  key={`h${c}`}
                  geometry={geo.header}
                  material={mats.steelMid}
                  position={[out * 0.11, SLEEVE_TOP + 0.01, cylinderZ(c)]}
                  rotation={[0, 0, out * 1.25]}
                />
              ))}
            </group>
          );
        })}
      </group>

      {/* Heads, one per bank, inside their bank frame so lift is along the cylinder axis. */}
      {banks.map((b) => {
        const angle = bankAngleRad(b === "L" ? 1 : 2);
        const y0 = SLEEVE_TOP + HEAD_HEIGHT / 2;
        return (
          <group key={`bank${b}`} name={`Bank${b}`} rotation={[0, 0, angle]}>
            <group name={b === "L" ? STATIC_NODES[1] : STATIC_NODES[2]} position={[0, y0, 0]} userData={{ y0 }}>
              <mesh geometry={geo.head} material={mats.steelDark} />
              <mesh geometry={geo.camCover} material={mats.steelMid} position={[0, HEAD_HEIGHT / 2 + 0.015, 0]} />
            </group>
            {/* Pistons and rods for this bank. */}
            {Array.from({ length: 4 }, (_, k) => (b === "L" ? 1 : 2) + k * 2).map((c) => (
              <group key={c}>
                <group name={pistonNode(c)} position={[0, TDC, cylinderZ(c)]}>
                  <mesh geometry={geo.piston} material={pistonMaterials[c - 1]} position={[0, 0.012, 0]} />
                  <mesh geometry={geo.pin2} material={mats.steelMid} rotation={[0, 0, Math.PI / 2]} />
                </group>
                <group name={rodNode(c)} position={[0, TDC, cylinderZ(c)]}>
                  <mesh geometry={geo.rod} material={mats.steelLight} position={[0, -G.rodLength / 2, 0]} />
                  <mesh
                    geometry={geo.bigEnd}
                    material={mats.steelMid}
                    position={[0, -G.rodLength, 0]}
                    rotation={[Math.PI / 2, 0, 0]}
                  />
                </group>
              </group>
            ))}
          </group>
        );
      })}

      {/* Crank: shaft along Z, four throws at the cross-plane angles, counterweights opposite. */}
      <group name={CRANK_NODE}>
        <mesh geometry={geo.shaft} material={mats.steelLight} rotation={[Math.PI / 2, 0, 0]} />
        {JOURNAL_Z.map((z, j) => {
          const t = G.journalThrowDeg[j] * (Math.PI / 180);
          const r = G.crankRadius;
          const px = -r * Math.sin(t);
          const py = r * Math.cos(t);
          return (
            <group key={j} position={[0, 0, z]}>
              <mesh geometry={geo.pin} material={mats.steelLight} position={[px, py, 0]} rotation={[Math.PI / 2, 0, 0]} />
              {[-0.04, 0.04].map((dz) => (
                <group key={dz} position={[0, 0, dz]} rotation={[0, 0, t]}>
                  <mesh geometry={geo.web} material={mats.steelMid} position={[0, r / 2, 0]} />
                  <mesh geometry={geo.counter} material={mats.steelMid} rotation={[Math.PI / 2, 0, Math.PI]} />
                </group>
              ))}
            </group>
          );
        })}
        <mesh geometry={geo.flywheel} material={mats.steelMid} position={[0, 0, ENGINE_LENGTH / 2 + 0.05]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={geo.pulley} material={mats.steelLight} position={[0, 0, -ENGINE_LENGTH / 2 - 0.05]} rotation={[Math.PI / 2, 0, 0]} />
      </group>
    </group>
  );
});
