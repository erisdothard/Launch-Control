// Combustion flash. Emissive interior of the firing cylinder.
// Colour = heat ramp by uCombustion, radial falloff from the spark point, flicker from uTime.
// Values exceed 1.0 on purpose so the bloom pass takes them (HDR frame buffer).

varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vLocal;

void main() {
  vUv = uv;
  vLocal = position;
  vNormalView = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// --- fragment ---
uniform float uTime;
uniform float uCombustion;
uniform float uSeed;
uniform vec3 uEmber;
uniform vec3 uEmberHot;
uniform vec3 uWhiteHot;
uniform vec3 uSteel;

varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vLocal;

vec3 heat(float t) {
  return t < 0.5 ? mix(uEmber, uEmberHot, t * 2.0) : mix(uEmberHot, uWhiteHot, (t - 0.5) * 2.0);
}

float hash11(float n) {
  return fract(sin(n) * 43758.5453);
}

float noise11(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), f);
}

void main() {
  float c = clamp(uCombustion, 0.0, 1.0);

  // Spark point is the top of the bore (local +y). Flame front rolls down with combustion.
  float fromTop = 1.0 - vUv.y;
  float front = smoothstep(c * 1.3 + 0.08, 0.0, fromTop);
  float radial = exp(-fromTop * fromTop * 3.0);

  // Flicker: fast crackle on a slower pulse, both from uTime.
  float crackle = 0.8 + 0.2 * noise11(uTime * 41.0 + uSeed * 7.0);
  float pulse = 0.85 + 0.15 * sin(uTime * 23.0 + uSeed);
  float flick = crackle * pulse;

  float intensity = (front * 2.6 + radial * 1.2) * c * flick;
  vec3 hot = heat(c * (0.55 + 0.45 * front));

  // Cold bore: dark steel with a faint rim so the cutaway still reads as metal.
  float rim = pow(1.0 - abs(vNormalView.z), 2.0);
  vec3 cold = uSteel * (0.25 + 0.35 * rim);

  vec3 col = mix(cold, hot * (0.4 + intensity), smoothstep(0.0, 0.25, c));
  gl_FragColor = vec4(col, 1.0);
}
