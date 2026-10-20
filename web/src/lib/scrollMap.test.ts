import { describe, it, expect } from "vitest";
import {
  BEATS,
  REV_HOLD_RPM,
  STAGE_LIMITER_RPM,
  EXPLODE_END,
  EXPLODE_HOLD,
  beatForProgress,
  explodeForProgress,
  fogForRpm,
  ignitionRpm,
  launchForProgress,
  partExplode,
  rpmForProgress,
} from "./scrollMap";
import { ENGINE_GEOMETRY } from "./engine/engineContract";

describe("scrollMap", () => {
  it("covers 0..1 with contiguous beats", () => {
    expect(BEATS[0].from).toBe(0);
    expect(BEATS[BEATS.length - 1].to).toBe(1);
    for (let i = 1; i < BEATS.length; i++) expect(BEATS[i].from).toBe(BEATS[i - 1].to);
  });

  it("rpm is monotonic non-decreasing up to the launch beat, then settles to idle", () => {
    let prev = -1;
    for (let i = 0; i <= 940; i++) {
      const r = rpmForProgress(i / 1000);
      expect(r).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = r;
    }
    expect(rpmForProgress(0.94)).toBe(STAGE_LIMITER_RPM);
    expect(rpmForProgress(1)).toBe(ENGINE_GEOMETRY.idleRpm);
  });

  it("idles at 800, holds the revs at 3200 and never reaches the mechanical limiter", () => {
    expect(rpmForProgress(0)).toBe(ENGINE_GEOMETRY.idleRpm);
    expect(rpmForProgress(0.88)).toBeCloseTo(REV_HOLD_RPM, 6);
    for (let i = 0; i <= 1000; i++) expect(rpmForProgress(i / 1000)).toBeLessThanOrEqual(STAGE_LIMITER_RPM);
  });

  it("maps beats by name", () => {
    expect(beatForProgress(0).id).toBe("idle");
    expect(beatForProgress(0.2).id).toBe("dive");
    expect(beatForProgress(0.5).id).toBe("combustion");
    expect(beatForProgress(0.75).id).toBe("rev");
    expect(beatForProgress(0.9).id).toBe("limiter");
    expect(beatForProgress(1).id).toBe("launch");
  });

  it("launch ramps only over 0.94..1", () => {
    expect(launchForProgress(0.9)).toBe(0);
    expect(launchForProgress(0.94)).toBe(0);
    expect(launchForProgress(1)).toBe(1);
    expect(launchForProgress(0.97)).toBeGreaterThan(0);
  });

  it("explode opens fully apart, holds, eases back together by the end, and stays assembled", () => {
    expect(explodeForProgress(0)).toBe(1);
    expect(explodeForProgress(EXPLODE_HOLD)).toBe(1);
    expect(explodeForProgress((EXPLODE_HOLD + EXPLODE_END) / 2)).toBeCloseTo(0.5, 5);
    expect(explodeForProgress(EXPLODE_END)).toBe(0);
    expect(explodeForProgress(1)).toBe(0);
    let prev = 1;
    for (let i = 0; i <= 1000; i++) {
      const k = explodeForProgress(i / 1000);
      expect(k).toBeLessThanOrEqual(prev + 1e-9);
      prev = k;
    }
  });

  it("part stagger stays in 0..1, outer parts lag on the way out", () => {
    for (const k of [0, 0.25, 0.5, 0.75, 1]) {
      for (const r of [0, 0.5, 1]) {
        const v = partExplode(k, r);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(partExplode(0, 1)).toBe(0);
    expect(partExplode(1, 1)).toBe(1);
    expect(partExplode(0.5, 0)).toBeGreaterThan(partExplode(0.5, 1));
    expect(partExplode(0.5, 0.5, 0)).toBe(partExplode(0.5, 1, 0));
  });

  it("ignition ends at idle and fog is 0 at idle, 1 at the limiter", () => {
    expect(ignitionRpm(0)).toBe(0);
    expect(ignitionRpm(1)).toBe(ENGINE_GEOMETRY.idleRpm);
    expect(fogForRpm(ENGINE_GEOMETRY.idleRpm)).toBe(0);
    expect(fogForRpm(STAGE_LIMITER_RPM)).toBeCloseTo(0.5, 6);
  });
});
