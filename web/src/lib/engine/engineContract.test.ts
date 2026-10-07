import { describe, it, expect } from "vitest";
import {
  ALL_NODES,
  BDC,
  ENGINE_GEOMETRY,
  TDC,
  bankOf,
  cylinderCrankAngle,
  firingCylinder,
  rpmToRadPerSec,
  sliderCrank,
} from "./engineContract";

describe("engine contract", () => {
  it("exposes 3 static nodes, a crank, 8 pistons and 8 rods", () => {
    expect(ALL_NODES).toHaveLength(3 + 1 + 8 + 8);
    expect(new Set(ALL_NODES).size).toBe(ALL_NODES.length);
  });

  it("slider-crank hits TDC at 0 and BDC at pi", () => {
    expect(sliderCrank(0).y).toBeCloseTo(TDC, 10);
    expect(sliderCrank(Math.PI).y).toBeCloseTo(BDC, 10);
    expect(sliderCrank(0).phi).toBeCloseTo(0, 10);
    expect(sliderCrank(Math.PI).phi).toBeCloseTo(0, 10);
  });

  it("slider-crank at 90 degrees matches the hand-computed value", () => {
    const { crankRadius: r, rodLength: l } = ENGINE_GEOMETRY;
    const { y, phi } = sliderCrank(Math.PI / 2);
    expect(y).toBeCloseTo(Math.sqrt(l * l - r * r), 10);
    expect(phi).toBeCloseTo(Math.asin(r / l), 10);
  });

  it("alternates banks by cylinder number", () => {
    expect([1, 2, 3, 4].map(bankOf)).toEqual(["L", "R", "L", "R"]);
  });

  it("cylinders on the same journal differ by exactly the bank angle", () => {
    const a1 = cylinderCrankAngle(1, 0);
    const a2 = cylinderCrankAngle(2, 0);
    expect(a2 - a1).toBeCloseTo(-ENGINE_GEOMETRY.bankAngleDeg * (Math.PI / 180), 10);
  });

  it("walks the firing order 1-8-4-3-6-5-7-2 across 720 degrees", () => {
    const seen: number[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = i * (Math.PI / 2) + 0.01;
      seen.push(firingCylinder(angle).cylinder);
    }
    expect(seen).toEqual([1, 8, 4, 3, 6, 5, 7, 2]);
    expect(firingCylinder(4 * Math.PI + 0.01).cylinder).toBe(1);
  });

  it("converts rpm to rad/s", () => {
    expect(rpmToRadPerSec(60)).toBeCloseTo(2 * Math.PI, 10);
  });
});
