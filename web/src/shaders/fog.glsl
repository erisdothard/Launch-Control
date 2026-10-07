// Exhaust fog. Camera-facing noise billboards, one instanced draw, depth-faded (soft particles).
// Colour: steel-grey at idle, warming toward ember as uFog rises. Not raymarched.

attribute vec3 aOffset;
attribute float aScale;
attribute float aSeed;

uniform float uTime;
uniform float uFog;

varying vec2 vUv;
varying float vSeed;
varying float vViewZ;
varying vec4 vClip;

void main() {
  vUv = uv;
  vSeed = aSeed;

  // Slow drift. Fog lifts and spreads as it thickens.
  float t = uTime * 0.06 + aSeed * 6.2831;
  vec3 drift = vec3(
    sin(t) * 0.35,
    0.25 * sin(t * 0.7) + uFog * 0.6 * aSeed,
    cos(t * 0.8) * 0.35
  );

  vec4 mv = modelViewMatrix * vec4(aOffset + drift, 1.0);
  float s = aScale * (0.85 + 0.55 * uFog);
  mv.xy += position.xy * s;

  vViewZ = mv.z;
  gl_Position = projectionMatrix * mv;
  vClip = gl_Position;
}

// --- fragment ---
#include <packing>

uniform sampler2D uDepth;
uniform float uHasDepth;
uniform float uCameraNear;
uniform float uCameraFar;
uniform float uSoft;
uniform float uTime;
uniform float uFog;
uniform float uDensity;
uniform vec3 uSteel;
uniform vec3 uEmber;

varying vec2 vUv;
varying float vSeed;
varying float vViewZ;
varying vec4 vClip;

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x),
                mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y);
  float b = mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x),
                mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y);
  return mix(a, b, f.z);
}

float fbm(vec3 p) {
  float amp = 0.5;
  float sum = 0.0;
  for (int i = 0; i < 5; i++) {
    sum += amp * vnoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  float mask = 1.0 - smoothstep(0.2, 1.0, r);
  mask *= mask;

  // Two octave bands drifting against each other read as volume, not a sprite.
  vec3 p = vec3(vUv * 3.0 + vSeed * 13.0, vSeed * 3.0);
  float n = fbm(p + vec3(uTime * 0.025, uTime * 0.04, uTime * 0.02));
  float m = fbm(p * 1.9 - vec3(uTime * 0.03, 0.0, uTime * 0.015));
  float density = smoothstep(0.34, 0.74, n * 0.7 + m * 0.3) * mask;

  // Soft particle: fade where the billboard crosses scene geometry.
  float fade = 1.0;
  if (uHasDepth > 0.5) {
    vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
    float sceneDepth = texture2D(uDepth, suv).x;
    float sceneZ = perspectiveDepthToViewZ(sceneDepth, uCameraNear, uCameraFar);
    fade = smoothstep(0.0, uSoft, vViewZ - sceneZ);
  }
  // Never clip against the near plane.
  fade *= smoothstep(0.6, 2.5, -vViewZ);

  // Steel at idle. The ember only reaches the brightest folds, from below.
  float warmth = uFog * uFog * (0.2 + 0.8 * (1.0 - vUv.y)) * (0.3 + 0.7 * n) * 0.4;
  vec3 col = mix(uSteel * 2.0, uEmber * 0.9, clamp(warmth, 0.0, 0.24));
  col *= 0.45 + 0.55 * n;

  float alpha = density * fade * uDensity * (0.2 + 0.42 * uFog);
  gl_FragColor = vec4(col, alpha);
}
