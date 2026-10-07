// Light rays from the firing cylinder. One material for two geometries:
//   uBillboard = 0  cone shell (origin at local y=0, widening along +y)
//   uBillboard = 1  camera-facing quad shells at the origin
// Additive. Colour follows the heat ramp by uCombustion.

uniform float uBillboard;
uniform float uHeight;
uniform float uShellScale;
uniform float uShellIndex;

varying vec2 vUv;
varying float vAlong;
varying float vRim;
varying vec3 vLocal;

void main() {
  vUv = uv;
  vLocal = position;

  if (uBillboard > 0.5) {
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // Second shell slightly larger and rotated so the two never align.
    float a = uShellIndex * 0.9;
    vec2 q = vec2(position.x * cos(a) - position.y * sin(a), position.x * sin(a) + position.y * cos(a));
    mv.xy += q * uShellScale * (1.0 + 0.35 * uShellIndex);
    vAlong = 0.0;
    vRim = 1.0;
    gl_Position = projectionMatrix * mv;
    return;
  }

  vAlong = clamp(position.y / uHeight, 0.0, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vRim = abs(n.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// --- fragment ---
uniform float uBillboard;
uniform float uTime;
uniform float uCombustion;
uniform float uIntensity;
uniform float uSeed;
uniform vec3 uEmber;
uniform vec3 uEmberHot;
uniform vec3 uWhiteHot;

varying vec2 vUv;
varying float vAlong;
varying float vRim;
varying vec3 vLocal;

vec3 heat(float t) {
  return t < 0.5 ? mix(uEmber, uEmberHot, t * 2.0) : mix(uEmberHot, uWhiteHot, (t - 0.5) * 2.0);
}

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

// Angular value noise that wraps cleanly around the full circle.
float rayNoise(float angle, float along, float scale) {
  float a = angle / 6.2831853 * scale;
  float n0 = vnoise(vec3(a, along * 2.0 - uTime * 0.9, uSeed));
  float n1 = vnoise(vec3(a - scale, along * 2.0 - uTime * 0.9, uSeed));
  return mix(n0, n1, smoothstep(scale * 0.75, scale, a));
}

void main() {
  float c = clamp(uCombustion, 0.0, 1.0);
  if (c <= 0.001) discard;

  // Hot core, but the rays themselves stay on the ember side of the ramp.
  vec3 col = heat(c * 0.6);
  if (uBillboard > 0.5) col = mix(col, heat(c * 0.9), exp(-dot(vUv - 0.5, vUv - 0.5) * 90.0));
  float lum;

  if (uBillboard > 0.5) {
    vec2 d = vUv - 0.5;
    float r = length(d) * 2.0;
    float angle = atan(d.y, d.x) + 3.14159265;
    float streak = rayNoise(angle, r * 1.5, 7.0);
    streak = smoothstep(0.42, 0.9, streak);
    float rays = streak * pow(1.0 - smoothstep(0.05, 1.0, r), 2.0) * 0.5;
    // The hot core: tight white centre, wide ember halo, both above 1.0 for the bloom.
    float core = exp(-r * r * 34.0) * 2.4 + exp(-r * r * 8.0) * 0.55;
    lum = (core + rays) * c;
  } else {
    float angle = atan(vLocal.x, vLocal.z) + 3.14159265;
    float streak = rayNoise(angle, vAlong, 11.0);
    streak = 0.12 + 0.88 * smoothstep(0.42, 0.82, streak);
    float lengthFade = pow(1.0 - vAlong, 2.2);
    float startFade = smoothstep(0.0, 0.06, vAlong);
    float rim = pow(vRim, 2.0);
    lum = streak * lengthFade * startFade * rim * 0.16 * c;
  }

  // Flicker from the firing pulse.
  float flick = 0.85 + 0.15 * vnoise(vec3(uTime * 18.0, uSeed, 0.0));
  gl_FragColor = vec4(col * lum * flick * uIntensity * (0.5 + 0.9 * c), 1.0);
}
