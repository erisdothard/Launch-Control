/*
  Engine node contract.
  Both the procedural placeholder engine and the real glTF asset expose exactly these node names.
  The rig (runtime slider-crank kinematics) drives them by name, so the two are interchangeable.
*/

export const CYLINDER_COUNT = 8;

/** Static parts. */
export const STATIC_NODES = ["Block", "HeadL", "HeadR"] as const;

/** Moving parts. */
export const CRANK_NODE = "Crank" as const;
export const pistonNode = (i: number) => `Cyl_${i}_Piston` as const;
export const rodNode = (i: number) => `Cyl_${i}_Rod` as const;

export const ALL_NODES: readonly string[] = [
  ...STATIC_NODES,
  CRANK_NODE,
  ...Array.from({ length: CYLINDER_COUNT }, (_, i) => pistonNode(i + 1)),
  ...Array.from({ length: CYLINDER_COUNT }, (_, i) => rodNode(i + 1)),
];

/**
 * Geometry in metres, scaled to a plausible small-block V8.
 * Bank angle 90°. Left bank = cylinders 1,3,5,7 (odd), right bank = 2,4,6,8 (even).
 * Crank throw angles are the classic cross-plane 90° layout.
 */
export const ENGINE_GEOMETRY = {
  bankAngleDeg: 90,
  bore: 0.1,
  stroke: 0.09,
  /** crank radius = stroke / 2 */
  crankRadius: 0.045,
  rodLength: 0.155,
  /** distance between cylinder centrelines along the crank axis */
  cylinderPitch: 0.11,
  /** crank throw angle per crank journal (one journal serves one left + one right cylinder) */
  journalThrowDeg: [0, 90, 270, 180] as const,
  /** cylinder → journal index (0..3). Cyl 1&2 share journal 0, 3&4 share 1, etc. */
  cylinderJournal: [0, 0, 1, 1, 2, 2, 3, 3] as const,
  /** standard cross-plane V8 firing order over 720° */
  firingOrder: [1, 8, 4, 3, 6, 5, 7, 2] as const,
  idleRpm: 800,
  redlineRpm: 7000,
  limiterRpm: 7400,
} as const;

/** Bank (left/right) for a 1-based cylinder number. */
export function bankOf(cylinder: number): "L" | "R" {
  return cylinder % 2 === 1 ? "L" : "R";
}

/** Bank rotation around the crank axis in radians: left bank -45°, right bank +45°. */
export function bankAngleRad(cylinder: number): number {
  const half = (ENGINE_GEOMETRY.bankAngleDeg / 2) * (Math.PI / 180);
  return bankOf(cylinder) === "L" ? -half : half;
}

/**
 * Crank angle for a cylinder, offset by its journal throw and its bank angle.
 * The right bank sees the same journal 90° later because the banks are 90° apart.
 */
export function cylinderCrankAngle(cylinder: number, crankAngleRad: number): number {
  const journal = ENGINE_GEOMETRY.cylinderJournal[cylinder - 1];
  const throwRad = ENGINE_GEOMETRY.journalThrowDeg[journal] * (Math.PI / 180);
  return crankAngleRad + throwRad - bankAngleRad(cylinder);
}

/**
 * Slider-crank kinematics.
 * Piston displacement along the cylinder axis from the crank centre:
 *   y = r·cos(θ) + sqrt(l² − r²·sin²(θ))
 * Rod angle from the cylinder axis:
 *   φ = asin(r·sin(θ) / l)
 */
export function sliderCrank(thetaRad: number, r = ENGINE_GEOMETRY.crankRadius, l = ENGINE_GEOMETRY.rodLength) {
  const s = Math.sin(thetaRad);
  const c = Math.cos(thetaRad);
  const y = r * c + Math.sqrt(l * l - r * r * s * s);
  const phi = Math.asin((r * s) / l);
  return { y, phi };
}

/** Top dead centre displacement (max y). */
export const TDC = ENGINE_GEOMETRY.crankRadius + ENGINE_GEOMETRY.rodLength;
/** Bottom dead centre displacement (min y). */
export const BDC = ENGINE_GEOMETRY.rodLength - ENGINE_GEOMETRY.crankRadius;

/**
 * Which cylinder fires at a given crank angle, over the 720° four-stroke cycle.
 * Returns the 1-based cylinder and the fraction (0..1) through its 90° firing window.
 */
export function firingCylinder(crankAngleRad: number): { cylinder: number; t: number } {
  const twoRev = 4 * Math.PI;
  const a = ((crankAngleRad % twoRev) + twoRev) % twoRev;
  const slot = (Math.PI / 2); // 720° / 8 = 90°
  const idx = Math.floor(a / slot);
  const t = (a - idx * slot) / slot;
  return { cylinder: ENGINE_GEOMETRY.firingOrder[idx], t };
}

/** RPM → crank angular velocity in rad/s. */
export function rpmToRadPerSec(rpm: number): number {
  return (rpm * 2 * Math.PI) / 60;
}
