"use client";

/*
  CameraRig: a CatmullRom camera path driven by the smoothed stage progress scrollState.p.
  The engine (engine-v2.glb) is centred on the origin: assembled ≈ 0.68 × 0.73 × 0.88 units,
  exploded ≈ 0.9 × 1.6 × 1.2. Rule: the whole object stays in frame with margin, the dive
  end comes closest, looking down into the opened stack.
  A faint shake builds with rpm; the starter rattle shakes during ignition. Timing between keys is
  a monotone cubic over arc length, so the move never changes speed abruptly.
  Position and look-at target are two curves sampled at the same u, so the gaze is continuous.
*/

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollState } from "@/lib/scrollState";
import { ignitionRattle, shakeForRpm, clamp01 } from "@/lib/scrollMap";

/** [p, position, target] keyframes. p is the stage progress. */
const KEYS: Array<[number, THREE.Vector3, THREE.Vector3]> = [
  // idle: wide 3/4, the whole engine with air around it
  [0.0, new THREE.Vector3(1.438, 0.525, 1.688), new THREE.Vector3(0.0, 0.02, 0.0)],
  [0.1, new THREE.Vector3(1.250, 0.625, 1.500), new THREE.Vector3(0.0, 0.04, 0.0)],
  // dive: the stack opens; the camera comes down and in so the layers read, never inside them
  [0.25, new THREE.Vector3(1.425, 1.000, 1.650), new THREE.Vector3(0.0, 0.1, 0.0)],
  [0.4, new THREE.Vector3(1.350, 0.900, 1.500), new THREE.Vector3(0.0, 0.1, 0.0)],
  // combustion: pulls back as the parts come home
  [0.52, new THREE.Vector3(1.075, 0.475, 1.200), new THREE.Vector3(0.0, 0.06, 0.0)],
  [0.65, new THREE.Vector3(1.188, 0.300, 1.350), new THREE.Vector3(0.0, 0.03, 0.0)],
  // rev: low 3/4, orbiting
  [0.8, new THREE.Vector3(1.312, 0.175, 1.188), new THREE.Vector3(0.0, 0.04, 0.0)],
  [0.94, new THREE.Vector3(1.475, 0.375, 1.475), new THREE.Vector3(0.0, 0.03, 0.0)],
  // launch / content: wide again, the turntable does the rest
  [1.0, new THREE.Vector3(1.562, 0.500, 1.625), new THREE.Vector3(0.0, 0.02, 0.0)],
];

/* Module-level: one camera rig per page, no per-frame allocation, nothing memoised gets mutated. */
const curves = {
  pos: new THREE.CatmullRomCurve3(KEYS.map((k) => k[1]), false, "centripetal", 0.5),
  tgt: new THREE.CatmullRomCurve3(KEYS.map((k) => k[2]), false, "centripetal", 0.5),
};
curves.pos.arcLengthDivisions = 400;
curves.tgt.arcLengthDivisions = 400;

/*
  p → u timing. Each key lands at its p, but the mapping between keys is a monotone cubic
  (Fritsch–Carlson), not a straight line, so the camera's speed is continuous through every key.
  u is then used as an arc-length parameter (getPointAt), so equal scroll = equal travel.
*/
const KEY_P = KEYS.map((k) => k[0]);
const KEY_U = KEYS.map((_, i) => i / (KEYS.length - 1));
const TANGENTS = (() => {
  const n = KEY_P.length;
  const d = Array.from({ length: n - 1 }, (_, i) => (KEY_U[i + 1] - KEY_U[i]) / (KEY_P[i + 1] - KEY_P[i]));
  const m = new Array<number>(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      m[i] = (3 * a) / h * d[i];
      m[i + 1] = (3 * b) / h * d[i];
    }
  }
  return m;
})();
const tmp = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), shake: new THREE.Vector3() };
let focusDistance = 1.8;

/** Camera-to-target distance of the last frame, for depth of field. */
export function getFocusDistance(): number {
  return focusDistance;
}

export function CameraRig() {
  useFrame(({ camera }) => {
    const s = scrollState;
    const u = progressToU(s.p);
    curves.pos.getPointAt(u, tmp.pos);
    curves.tgt.getPointAt(u, tmp.tgt);

    const t = s.time;
    const revShake = shakeForRpm(s.rpm) * 0.004;
    const rattle = s.phase === "igniting" ? ignitionRattle(s.ignition) * 0.005 : 0;
    const amp = revShake + rattle;
    if (amp > 0) {
      tmp.shake.set(
        Math.sin(t * 61.3) * 0.6 + Math.sin(t * 97.1) * 0.4,
        Math.sin(t * 73.7) * 0.6 + Math.cos(t * 113.3) * 0.4,
        Math.sin(t * 53.1) * 0.3,
      );
      tmp.pos.addScaledVector(tmp.shake, amp);
    }
    camera.position.copy(tmp.pos);
    camera.lookAt(tmp.tgt);
    focusDistance = tmp.pos.distanceTo(tmp.tgt);
  });

  return null;
}

/** Map progress to the curve parameter: monotone cubic through the keys, C1 at every key. */
function progressToU(p: number): number {
  const x = clamp01(p);
  const n = KEY_P.length - 1;
  for (let i = 0; i < n; i++) {
    const a = KEY_P[i];
    const b = KEY_P[i + 1];
    if (x >= a && x <= b) {
      const h = b - a;
      const t = (x - a) / h;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      return clamp01(h00 * KEY_U[i] + h10 * h * TANGENTS[i] + h01 * KEY_U[i + 1] + h11 * h * TANGENTS[i + 1]);
    }
  }
  return 1;
}
