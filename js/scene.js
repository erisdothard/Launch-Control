// Launch Control: "The Circuit"
// One fixed WebGL canvas behind the page. Scroll progress (0..1) flies the
// camera down a night circuit. The track is the pipeline; particles are
// prospects converging into it; seven gates light up as you pass them.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const VOLT = new THREE.Color("#c8ff00");
const WHITE = new THREE.Color("#ffffff");
const BLACK = new THREE.Color("#050505");

const canvas = document.getElementById("gl");
const isMobile = matchMedia("(max-width: 720px)").matches;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Renderer ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.25 : 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = BLACK;
scene.fog = new THREE.FogExp2(0x050505, 0.028);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);

/* ---------- Track path (the pipeline) ---------- */
// A sweeping circuit: long straight, fast left, chicane, climb, final straight.
const pts = [
  [0, 0, 0], [0, 0, -18], [3, 0, -34], [12, 0.5, -46], [22, 1.5, -52],
  [34, 2, -50], [42, 2.5, -40], [44, 3.5, -26], [40, 5, -12], [44, 6, 2],
  [54, 7, 10], [68, 8, 8], [80, 8, -4], [86, 8, -20], [88, 8, -40],
].map((p) => new THREE.Vector3(...p));
const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.6);
const TRACK_LEN = curve.getLength();

/* ---------- Ground: asphalt grid shader ---------- */
const groundUniforms = {
  uTime: { value: 0 },
  uSpeed: { value: 0 },
  uVolt: { value: VOLT },
  uCam: { value: new THREE.Vector3() },
};
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(500, 500, 1, 1),
  new THREE.ShaderMaterial({
    uniforms: groundUniforms,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vW;
      uniform float uTime, uSpeed; uniform vec3 uVolt, uCam;
      float gridLine(vec2 p, float w) {
        vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
        return 1.0 - smoothstep(0.0, w, min(g.x, g.y));
      }
      void main() {
        vec2 p = vW.xz;
        float d = distance(vW.xz, uCam.xz);
        // two grid scales, the fine one fades with distance
        float fine = gridLine(p * 0.5, 1.2) * smoothstep(60.0, 10.0, d);
        float coarse = gridLine(p * 0.1, 1.4) * smoothstep(140.0, 20.0, d);
        // pulses sweeping outward from the camera with scroll speed
        float ring = sin(d * 0.6 - uTime * (2.0 + uSpeed * 14.0));
        ring = smoothstep(0.95, 1.0, ring) * smoothstep(90.0, 15.0, d) * smoothstep(4.0, 12.0, d) * (0.06 + uSpeed * 0.3);
        vec3 base = vec3(0.012, 0.013, 0.015);
        vec3 col = base + vec3(0.06) * fine + vec3(0.10) * coarse + uVolt * ring * 0.2;
        // volt haze near the camera, black at the horizon
        float fog = 1.0 - exp(-d * d * 0.00022);
        col = mix(col, vec3(0.02), fog);
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.6;
scene.add(ground);

/* ---------- Track ribbon: flowing light-pulse shader ---------- */
const trackUniforms = { uTime: { value: 0 }, uSpeed: { value: 0 }, uProgress: { value: 0 }, uVolt: { value: VOLT } };
const trackMat = new THREE.ShaderMaterial({
  uniforms: trackUniforms,
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv; uniform float uTime, uSpeed, uProgress; uniform vec3 uVolt;
    void main() {
      float u = vUv.x;            // along the track
      float v = abs(vUv.y - 0.5); // across (0 centre, 0.5 edge)
      float aa = fwidth(v) * 1.5;
      // asphalt body
      vec3 col = vec3(0.035, 0.037, 0.04);
      float alpha = 0.92;
      // volt rails on both edges
      float rail = smoothstep(0.47 - aa, 0.47, v) * smoothstep(0.5, 0.5 - aa, v);
      // centre dashes travelling with scroll speed
      float dash = step(0.5, fract(u * 120.0 - uTime * (0.5 + uSpeed * 5.0))) * smoothstep(0.012 + aa, 0.012, v);
      // behind the camera is worked pipeline: rails glow harder
      float worked = smoothstep(uProgress + 0.02, uProgress - 0.08, u);
      col = mix(col, uVolt * (0.7 + worked * 0.5), rail);
      col = mix(col, uVolt * (0.35 + worked * 0.4), dash);
      gl_FragColor = vec4(col, alpha);
    }`,
});
// Flat ribbon along the curve: uv.x runs along the track, uv.y across it.
function ribbon(curve, segments, halfWidth, lift) {
  const g = new THREE.BufferGeometry();
  const P = [], UV = [], I = [];
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    side.crossVectors(tan, up).normalize().multiplyScalar(halfWidth);
    P.push(p.x - side.x, p.y + lift, p.z - side.z, p.x + side.x, p.y + lift, p.z + side.z);
    UV.push(t, 0, t, 1);
    if (i < segments) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(I);
  return g;
}
const track = new THREE.Mesh(ribbon(curve, 600, 2.4, -0.5), trackMat);
scene.add(track);

/* ---------- Gates: seven steps ---------- */
const GATES = 7;
const gates = [];
// Gantry: two posts and a top bar spanning the track.
const gateGeo = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-3.6, 0); shape.lineTo(3.6, 0); shape.lineTo(3.6, 5.2); shape.lineTo(-3.6, 5.2); shape.lineTo(-3.6, 0);
  const hole = new THREE.Path();
  hole.moveTo(-3.2, 0); hole.lineTo(3.2, 0); hole.lineTo(3.2, 4.8); hole.lineTo(-3.2, 4.8); hole.lineTo(-3.2, 0);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false });
})();
const zAxis = new THREE.Vector3(0, 0, 1);
for (let i = 0; i < GATES; i++) {
  const t = 0.1 + (i / (GATES - 1)) * 0.78;
  const mat = new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, opacity: 0.3 });
  const m = new THREE.Mesh(gateGeo, mat);
  const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
  tan.y = 0; tan.normalize();
  m.position.copy(p).y -= 0.5;
  m.quaternion.setFromUnitVectors(zAxis, tan);
  m.userData.t = t;
  scene.add(m);
  gates.push(m);
}

/* ---------- Particles: prospects converging into the pipeline ---------- */
const COUNT = isMobile ? 2500 : 7000;
const pos = new Float32Array(COUNT * 3);
const home = new Float32Array(COUNT * 3); // scattered position
const along = new Float32Array(COUNT);    // t along the curve
const seed = new Float32Array(COUNT);
for (let i = 0; i < COUNT; i++) {
  const t = Math.random();
  const p = curve.getPointAt(t);
  along[i] = t;
  seed[i] = Math.random();
  const r = 8 + Math.random() * 40, a = Math.random() * Math.PI * 2;
  home[i * 3] = p.x + Math.cos(a) * r;
  home[i * 3 + 1] = 0.5 + Math.random() * 14;
  home[i * 3 + 2] = p.z + Math.sin(a) * r;
  pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); // curve positions
pGeo.setAttribute("aHome", new THREE.BufferAttribute(home, 3));
pGeo.setAttribute("aT", new THREE.BufferAttribute(along, 1));
pGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
const pUniforms = {
  uTime: { value: 0 },
  uGather: { value: 0 },     // 0 = scattered, 1 = in the pipeline
  uProgress: { value: 0 },
  uVolt: { value: VOLT },
  uPix: { value: renderer.getPixelRatio() },
};
const particles = new THREE.Points(
  pGeo,
  new THREE.ShaderMaterial({
    uniforms: pUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aHome; attribute float aT, aSeed;
      uniform float uTime, uGather, uProgress, uPix;
      varying float vLit, vSeed, vNear;
      void main() {
        // each prospect gathers at a slightly different moment
        float g = smoothstep(0.0, 1.0, (uGather - aSeed * 0.5) / 0.5);
        vec3 drift = vec3(sin(uTime * 0.4 + aSeed * 40.0), cos(uTime * 0.3 + aSeed * 20.0), sin(uTime * 0.5 + aSeed * 10.0)) * (1.0 - g) * 1.5;
        vec3 p = mix(aHome + drift, position + vec3(0.0, 0.6 + sin(uTime * 2.0 + aSeed * 60.0) * 0.3, 0.0), g);
        // prospects behind the camera are "worked": lit volt
        vLit = smoothstep(uProgress + 0.03, uProgress - 0.05, aT) * g;
        vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vNear = smoothstep(2.0, 9.0, -mv.z);
        gl_PointSize = (1.2 + aSeed * 1.8 + vLit * 1.5) * uPix * (22.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uVolt; varying float vLit, vSeed, vNear;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.05, d);
        vec3 col = mix(vec3(0.8), uVolt, vLit);
        gl_FragColor = vec4(col, a * (0.22 + vLit * 0.6) * vNear);
      }`,
  })
);
scene.add(particles);

/* ---------- Speed streaks ---------- */
const STREAKS = isMobile ? 120 : 300;
const sGeo = new THREE.BufferGeometry();
const sPos = new Float32Array(STREAKS * 2 * 3);
sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
const streakOffsets = Array.from({ length: STREAKS }, () => ({
  x: (Math.random() - 0.5) * 60, y: Math.random() * 16, z: Math.random() * 120, len: 2 + Math.random() * 10,
}));
const streaks = new THREE.LineSegments(
  sGeo,
  new THREE.LineBasicMaterial({ color: VOLT, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
);
scene.add(streaks);

/* ---------- Post ---------- */
let composer = null;
if (!isMobile) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.75);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

/* ---------- Scroll state ---------- */
const state = { target: 0, progress: 0, velocity: 0, gather: 0, mouseX: 0, mouseY: 0 };
const readScroll = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  state.target = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
};
addEventListener("scroll", readScroll, { passive: true });
addEventListener("mousemove", (e) => {
  state.mouseX = (e.clientX / innerWidth - 0.5) * 2;
  state.mouseY = (e.clientY / innerHeight - 0.5) * 2;
}, { passive: true });
readScroll();

// Sections announce which "sector" we're in so the scene can react.
// data-gather on a section: how far prospects should converge (0..1).
const sections = [...document.querySelectorAll("[data-sector]")];
const hud = {
  speed: document.querySelector("[data-hud=speed]"),
  sector: document.querySelector("[data-hud=sector]"),
  bar: document.querySelector("[data-hud=bar]"),
  dist: document.querySelector("[data-hud=dist]"),
};

/* ---------- Resize ---------- */
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer && composer.setSize(innerWidth, innerHeight);
  readScroll();
});

/* ---------- Frame ---------- */
let last = performance.now() / 1000, elapsed = 0;
const camPos = new THREE.Vector3(), look = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const side = new THREE.Vector3();
let gatherTarget = 0;

function frame() {
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, now - last); last = now; elapsed += dt;
  const t = elapsed;

  // damped scroll follow: the camera lags the page a touch, like a chase cam
  const prev = state.progress;
  state.progress += (state.target - state.progress) * (1 - Math.exp(-dt * 4.5));
  const v = (state.progress - prev) / Math.max(dt, 1e-4);
  state.velocity += (Math.min(1, Math.abs(v) * 6) - state.velocity) * (1 - Math.exp(-dt * 5));
  const speed = state.velocity;

  // which sector are we in (section mostly in view)?
  let active = 0;
  for (let i = 0; i < sections.length; i++) {
    const r = sections[i].getBoundingClientRect();
    if (r.top < innerHeight * 0.55) active = i;
  }
  const activeEl = sections[active];
  gatherTarget = activeEl ? Number(activeEl.dataset.gather ?? 1) : 0;
  state.gather += (gatherTarget - state.gather) * (1 - Math.exp(-dt * 2));

  // camera along the curve, slightly behind and above the "car"
  const p = Math.min(0.95, Math.max(0.0, state.progress * 0.95));
  curve.getPointAt(p, camPos);
  curve.getPointAt(Math.min(1, p + 0.03), look);
  const tan = curve.getTangentAt(p);
  side.crossVectors(tan, up).normalize();
  camPos.addScaledVector(side, 3.2 + state.mouseX * 0.8);
  camPos.y += 2.4 + state.mouseY * -0.5;
  look.y += 1.6;
  camera.position.lerp(camPos, 1 - Math.exp(-dt * 6));
  camera.lookAt(look);
  // speed stretches the FOV
  camera.fov += (60 + speed * 22 - camera.fov) * (1 - Math.exp(-dt * 4));
  camera.updateProjectionMatrix();

  // uniforms
  groundUniforms.uTime.value = t; groundUniforms.uSpeed.value = speed; groundUniforms.uCam.value.copy(camera.position);
  ground.position.x = camera.position.x; ground.position.z = camera.position.z;
  trackUniforms.uTime.value = t; trackUniforms.uSpeed.value = speed; trackUniforms.uProgress.value = p;
  pUniforms.uTime.value = t; pUniforms.uGather.value = state.gather; pUniforms.uProgress.value = p;

  // gates light as the camera passes
  for (const g of gates) {
    const passed = p > g.userData.t - 0.01;
    const near = Math.max(0, 1 - Math.abs(p - g.userData.t) * 40);
    g.material.color.lerpColors(WHITE, VOLT, passed ? 1 : near);
    const through = 1 - Math.max(0, 1 - Math.abs(p - g.userData.t) * 120); // 0 while passing through
    g.material.opacity += ((passed ? 0.9 : 0.25 + near * 0.5) * through - g.material.opacity) * (1 - Math.exp(-dt * 8));
  }

  // streaks: spawn around the camera, slide past with speed
  const sp = sGeo.attributes.position.array;
  for (let i = 0; i < STREAKS; i++) {
    const s = streakOffsets[i];
    s.z -= dt * (20 + speed * 220);
    if (s.z < -10) { s.z = 100 + Math.random() * 40; s.x = (Math.random() - 0.5) * 60; s.y = Math.random() * 16; }
    const bx = camera.position.x + side.x * s.x - tan.x * s.z;
    const bz = camera.position.z + side.z * s.x - tan.z * s.z;
    const by = s.y - 2;
    const L = s.len * (0.3 + speed * 2);
    sp[i * 6] = bx; sp[i * 6 + 1] = by; sp[i * 6 + 2] = bz;
    sp[i * 6 + 3] = bx + tan.x * L; sp[i * 6 + 4] = by; sp[i * 6 + 5] = bz + tan.z * L;
  }
  sGeo.attributes.position.needsUpdate = true;
  streaks.material.opacity = 0.05 + speed * 0.7;

  // HUD
  if (hud.speed) hud.speed.textContent = String(Math.round(speed * 320)).padStart(3, "0");
  if (hud.sector) hud.sector.textContent = `S${String(active + 1).padStart(2, "0")}`;
  if (hud.bar) hud.bar.style.transform = `scaleX(${state.progress})`;
  if (hud.dist) hud.dist.textContent = (p * TRACK_LEN / 1000).toFixed(2) + " KM";
  sections.forEach((s, i) => s.classList.toggle("is-active", i === active));

  composer ? composer.render() : renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

if (reduceMotion) {
  // one still frame, no animation loop
  state.progress = state.target;
  frame();
} else {
  frame();
}
document.documentElement.classList.add("gl-ready");
