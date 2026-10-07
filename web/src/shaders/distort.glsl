// Postprocessing Effect fragment (pmndrs/postprocessing conventions, no vertex stage).
// Radial warp lives in mainUv so every later effect (bloom) samples the warped frame.
// Chromatic aberration, film grain and a limiter vignette live in mainImage.
// uStrength 0 at idle, 1 at the limiter. uFlash is the launch white-out.

uniform float uStrength;
uniform float uTime;
uniform float uFlash;
uniform vec3 uFlashColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void mainUv(inout vec2 uv) {
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);
  // Barrel (inward) so the warped sample never leaves the frame.
  uv -= d * r2 * uStrength * 0.16;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);

  // Lateral split grows from the centre outward, a lens under strain.
  vec2 ca = d * (0.002 + r2 * 0.012) * uStrength;
  vec3 col;
  col.r = texture2D(inputBuffer, uv + ca).r;
  col.g = inputColor.g;
  col.b = texture2D(inputBuffer, uv - ca).b;

  // Film grain. A whisper at idle, a hiss at redline.
  float g = hash12(uv * resolution + fract(uTime) * vec2(97.0, 13.0)) - 0.5;
  col += g * (0.004 + 0.014 * uStrength);

  // The frame closes in as the limiter approaches.
  float vig = smoothstep(0.18, 0.6, r2) * uStrength * 0.45;
  col *= 1.0 - vig;

  col = mix(col, uFlashColor, uFlash);
  outputColor = vec4(col, inputColor.a);
}
