"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, BufferGeometry, CylinderGeometry, DoubleSide, Euler, Matrix4, Mesh, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CombustionFlash } from "@/components/fx/Combustion";
import type { FxState } from "@/components/fx/fxState";

/* A V8 from primitives: crank axis along x, two banks at 45 degrees. Stand-in only. */
const BANK = Math.PI / 4;
const PITCH = 0.62;
const BORE = 0.24;
const CYL_HEIGHT = 1.05;
const CYL_Y = 0.62;
const XS = [-1.5, -0.5, 0.5, 1.5].map((i) => i * PITCH);

function cylinderMatrix(x: number, bankSign: number): Matrix4 {
  const euler = new Euler(bankSign * BANK, 0, 0);
  const position = new Vector3(x, CYL_Y, 0).applyEuler(euler);
  return new Matrix4().makeRotationFromEuler(euler).setPosition(position);
}

/* Cylinder 1 (left bank, front): the firing bore. Exported for the rays origin. */
const FIRE_MATRIX = cylinderMatrix(XS[0], -1);
const fireTop = new Vector3(0, CYL_HEIGHT / 2, 0).applyMatrix4(FIRE_MATRIX);
const fireUp = new Vector3(0, 1, 0).applyEuler(new Euler(-BANK, 0, 0));
export const FIRE_ORIGIN: [number, number, number] = [fireTop.x, fireTop.y, fireTop.z];
export const FIRE_DIRECTION: [number, number, number] = [fireUp.x, fireUp.y, fireUp.z];
const FIRE_CENTER = new Vector3(0, 0, 0).applyMatrix4(FIRE_MATRIX);

export function useSampleMesh(): Mesh {
  const mesh = useMemo(() => {
    const parts: BufferGeometry[] = [new BoxGeometry(2.9, 1.1, 1.5)];
    for (const x of XS) {
      for (const sign of [-1, 1]) {
        const g = new CylinderGeometry(BORE + 0.08, BORE + 0.08, CYL_HEIGHT, 24, 1, false);
        g.applyMatrix4(cylinderMatrix(x, sign));
        parts.push(g);
      }
    }
    const merged = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    return new Mesh(merged);
  }, []);
  useEffect(() => () => mesh.geometry.dispose(), [mesh]);
  return mesh;
}

export function StandInEngine({ state }: { state: FxState }) {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[2.9, 1.1, 1.5]} />
        <meshStandardMaterial color="#3a414a" metalness={0.85} roughness={0.42} />
      </mesh>
      {XS.map((x) =>
        [-1, 1].map((sign) => {
          const m = cylinderMatrix(x, sign);
          const pos = new Vector3().setFromMatrixPosition(m);
          const rot = new Euler(sign * BANK, 0, 0);
          const isFire = sign === -1 && x === XS[0];
          return (
            <mesh key={`${x}:${sign}`} position={pos} rotation={rot}>
              <cylinderGeometry
                args={isFire ? [BORE + 0.08, BORE + 0.08, CYL_HEIGHT, 32, 1, true, Math.PI * 0.56, Math.PI * 1.33] : [BORE + 0.08, BORE + 0.08, CYL_HEIGHT, 32, 1, false]}
              />
              <meshStandardMaterial color="#4a5059" metalness={0.8} roughness={0.38} side={DoubleSide} />
            </mesh>
          );
        }),
      )}
      <group position={FIRE_CENTER} rotation={new Euler(-BANK, 0, 0)}>
        <CombustionFlash state={state} radius={BORE} height={CYL_HEIGHT} seed={1} lightPower={60} />
      </group>
    </group>
  );
}
