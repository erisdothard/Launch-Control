// Launch morph. Points sampled from the engine surface lerp into light-speed streaks by uLaunch.
// One material for two draws: uLine = 0 renders gl.POINTS, uLine = 1 renders LINES (head/tail pairs).
// Colour runs ember -> white-hot with the launch. Additive, HDR, bloom takes the head.

attribute float aSeed;
attribute float aEnd;

uniform float uLaunch;
uniform float uPixelRatio;
uniform float uSize;
uniform float uStreak;
uniform float uLine;

varying float vAlpha;
varying float vHeat;

float hash11(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  float s1 = hash11(aSeed * 12.9898);
  float s2 = hash11(aSeed * 78.233);
  float s3 = hash11(aSeed * 37.719);

  // Staggered start: the dissolve ripples through the block instead of popping.
  float t = clamp((uLaunch - s1 * 0.6) / 0.4, 0.0, 1.0);
  float e = t * t * t;

  vec4 mv = modelViewMatrix * vec4(position, 1.0);

  // Loosen off the surface first, then rip toward the camera along view z.
  vec3 scatter = vec3(s2 - 0.5, s3 - 0.5, 0.0) * 0.5 * smoothstep(0.0, 0.3, t);
  vec3 dir = vec3((s2 - 0.5) * 0.7, (s3 - 0.5) * 0.7, 1.0);
  float travel = uStreak * e;
  float along = uLine > 0.5 ? mix(0.7, 1.0, aEnd) : 1.0;
  mv.xyz += scatter + dir * travel * along;

  gl_Position = projectionMatrix * mv;

  float dist = max(-mv.z, 0.2);
  float size = uSize * uPixelRatio * (1.0 + 0.6 * e) * (9.0 / dist);
  gl_PointSize = min(size, 10.0 * uPixelRatio);

  vHeat = t;
  float appear = smoothstep(0.0, 0.12, uLaunch);
  float gone = 1.0 - e;
  vAlpha = uLine > 0.5
    ? smoothstep(0.02, 0.25, e) * aEnd * 0.65 * (0.25 + 0.75 * gone)
    : appear * gone * gone * gone;
}

// --- fragment ---
uniform float uLine;
uniform vec3 uEmber;
uniform vec3 uEmberHot;
uniform vec3 uWhiteHot;

varying float vAlpha;
varying float vHeat;

vec3 heat(float t) {
  return t < 0.5 ? mix(uEmber, uEmberHot, t * 2.0) : mix(uEmberHot, uWhiteHot, (t - 0.5) * 2.0);
}

void main() {
  float a = vAlpha;
  if (uLine < 0.5) {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c) * 4.0;
    if (d > 1.0) discard;
    a *= 1.0 - d;
  }
  if (a <= 0.002) discard;
  vec3 col = heat(vHeat) * (uLine > 0.5 ? 0.5 + 1.1 * vHeat : 0.35 + 0.9 * vHeat);
  gl_FragColor = vec4(col * a, a);
}
