"use client";

import { BlendFunction, Effect } from "postprocessing";
import { wrapEffect } from "@react-three/postprocessing";
import { Color, Uniform } from "three";
import distortSource from "@/shaders/distort.glsl";
import { HEAT } from "./fxState";

/* White-hot pushed above 1.0 so it survives ACES as a true white-out. */
const FLASH_COLOR = new Color().copy(HEAT.whiteHot).multiplyScalar(2.5);

export type DistortionOptions = {
  /** 0 at idle, 1 at the limiter. */
  strength?: number;
  /** 0..1 launch white-out. */
  flash?: number;
  blendFunction?: BlendFunction;
};

/**
 * One merged pass: radial warp (mainUv, so bloom samples the warped frame too),
 * chromatic aberration, film grain, limiter vignette, launch white-out.
 */
export class DistortionEffect extends Effect {
  constructor({ strength = 0, flash = 0, blendFunction = BlendFunction.NORMAL }: DistortionOptions = {}) {
    super("DistortionEffect", distortSource, {
      blendFunction,
      uniforms: new Map<string, Uniform>([
        ["uStrength", new Uniform(strength)],
        ["uTime", new Uniform(0)],
        ["uFlash", new Uniform(flash)],
        ["uFlashColor", new Uniform(FLASH_COLOR)],
      ]),
    });
  }

  get strength(): number {
    return this.uniforms.get("uStrength")!.value as number;
  }
  set strength(value: number) {
    this.uniforms.get("uStrength")!.value = value;
  }

  get flash(): number {
    return this.uniforms.get("uFlash")!.value as number;
  }
  set flash(value: number) {
    this.uniforms.get("uFlash")!.value = value;
  }

  /** Seconds. Driven from FxState.time so a frozen clock gives a frozen grain. */
  get time(): number {
    return this.uniforms.get("uTime")!.value as number;
  }
  set time(value: number) {
    this.uniforms.get("uTime")!.value = value;
  }
}

export const Distortion = wrapEffect(DistortionEffect);
