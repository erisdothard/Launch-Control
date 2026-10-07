import { createFxState, type FxState } from "@/components/fx/fxState";

/**
 * Lab-local stand-in for Track B's `scrollState`. Same shape, mutated in place by the
 * sliders and the clock, read by the FX in useFrame.
 */
export const labState: FxState = createFxState({ rpm: 800, fog: 0.1 });

export const labClock = { frozen: false, offset: 0 };

export type LabKey = keyof FxState;

export const LAB_RANGES: Record<Exclude<LabKey, "time">, { min: number; max: number; step: number }> = {
  p: { min: 0, max: 1, step: 0.001 },
  rpm: { min: 0, max: 7400, step: 10 },
  combustion: { min: 0, max: 1, step: 0.01 },
  fog: { min: 0, max: 1, step: 0.01 },
  launch: { min: 0, max: 1, step: 0.01 },
};
