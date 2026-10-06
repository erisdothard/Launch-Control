// Launch Control: "The Engine"
// One fixed WebGL canvas. An engine floats exploded in the hero and assembles
// as you scroll: each part group seats inside its own scroll window, so the
// scrollbar is the playhead and scrolling back takes it apart again. At the
// end it fires. Native scroll only; nothing here touches the wheel.
//
// Parts are built procedurally so the site works today. To swap in a real
// model, export a GLB whose top-level nodes are named like PART_ORDER below
// and set MODEL_URL; the rig (explode offsets, windows, hover, ignition) is
// the same either way.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const MODEL_URL = ""; // e.g. "assets/models/engine.glb" (Draco OK). Empty = procedural engine.

const VOLT = new THREE.Color("#c8ff00");
const canvas = document.getElementById("gl");
const isMobile = matchMedia("(max-width: 720px)").matches;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const hotspot = document.querySelector(".hotspot");

/* ---------- Renderer / scene ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#050505");
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);

// Lights: cool key, warm-less fill, volt rim. The env map does most of the metal.
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 6, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0x8899aa, 0.6); fill.position.set(-5, 2, -3); scene.add(fill);
const rim = new THREE.DirectionalLight(VOLT, 1.4); rim.position.set(-3, 1.5, -6); scene.add(rim);
scene.add(new THREE.AmbientLight(0xffffff, 0.12));

// Floor: dark disc with a faint volt grid so the engine has a ground.
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(14, 64),
  new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uVolt: { value: VOLT }, uTime: { value: 0 }, uFire: { value: 0 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      precision highp float; varying vec2 vP; uniform vec3 uVolt; uniform float uTime, uFire;
      void main(){
        float d = length(vP);
        vec2 g = abs(fract(vP * 0.8 - 0.5) - 0.5) / fwidth(vP * 0.8);
        float line = 1.0 - smoothstep(0.0, 1.2, min(g.x, g.y));
        float fade = smoothstep(14.0, 2.0, d);
        float pulse = smoothstep(0.96, 1.0, sin(d * 1.5 - uTime * 3.0)) * uFire * smoothstep(10.0, 1.0, d);
        vec3 col = vec3(0.02) + vec3(0.07) * line * fade + uVolt * pulse * 0.5;
        float a = fade * (0.9) ;
        gl_FragColor = vec4(col, a);
      }`,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.4;
scene.add(floor);

/* ---------- Materials ---------- */
const M = {
  carbon: new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.35, roughness: 0.55 }),
  block: new THREE.MeshStandardMaterial({ color: 0x1d1f23, metalness: 0.6, roughness: 0.5 }),
  alu: new THREE.MeshStandardMaterial({ color: 0x9ea4ab, metalness: 0.95, roughness: 0.32 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x5c6168, metalness: 1.0, roughness: 0.28 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, metalness: 0.2, roughness: 0.8 }),
  volt: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: VOLT, emissiveIntensity: 0.0, metalness: 0.2, roughness: 0.4 }),
  hot: new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.9, roughness: 0.35, emissive: VOLT, emissiveIntensity: 0.0 }),
};

/* ---------- Part groups ----------
   Each group: build() adds meshes; explode = where it floats in the hero; win = scroll window in which it seats.
   Order here is the assembly order. */
const BANK = Math.PI / 4; // V angle from vertical
const bankDir = (side) => new THREE.Vector3(0, Math.cos(BANK), side * Math.sin(BANK)); // along a bank's bore axis
const PART_ORDER = ["block", "crank", "pistonsL", "pistonsR", "heads", "intake", "harness", "headers", "turbo"];
const PARTS = {
  block: {
    label: "Block", service: "CRM & sales infrastructure", note: "The thing everything bolts to.",
    explode: new THREE.Vector3(0, -0.5, 0.9), rot: new THREE.Euler(0.08, -0.25, 0.05), win: [0.10, 0.24],
  },
  crank: {
    label: "Crankshaft", service: "Outbound business development", note: "Turns the work into motion.",
    explode: new THREE.Vector3(0.4, -1.5, 1.4), rot: new THREE.Euler(0, 0, 0.25), win: [0.25, 0.35],
  },
  pistonsL: {
    label: "Pistons", service: "Lead generation", note: "The parts that do the work.",
    explode: bankDir(-1).multiplyScalar(2.6), rot: new THREE.Euler(0, 0, 0), win: [0.29, 0.41],
  },
  pistonsR: {
    label: "Pistons", service: "Lead generation", note: "The parts that do the work.",
    explode: bankDir(1).multiplyScalar(2.6), rot: new THREE.Euler(0, 0, 0), win: [0.31, 0.43],
  },
  heads: {
    label: "Cylinder heads", service: "Positioning & messaging", note: "How attention gets in.",
    explode: new THREE.Vector3(0, 2.4, 0), rot: new THREE.Euler(0.15, 0, -0.12), win: [0.40, 0.52],
  },
  intake: {
    label: "Intake", service: "Web & digital presence", note: "The air the engine breathes.",
    explode: new THREE.Vector3(0, 4.2, -0.4), rot: new THREE.Euler(0, 0.3, 0.1), win: [0.46, 0.58],
  },
  harness: {
    label: "ECU & harness", service: "The Launch Control CRM", note: "The brain. Every signal logged.",
    explode: new THREE.Vector3(-1.2, 2.2, 2.2), rot: new THREE.Euler(0.4, 0.2, 0), win: [0.54, 0.64],
  },
  headers: {
    label: "Headers", service: "Follow-up", note: "Where the heat goes out.",
    explode: new THREE.Vector3(1.2, -0.4, 2.6), rot: new THREE.Euler(-0.3, 0.2, 0), win: [0.64, 0.74],
  },
  turbo: {
    label: "Turbo", service: "Growth strategy", note: "Boost. Where the power showed.",
    explode: new THREE.Vector3(3.4, 0.9, 0.6), rot: new THREE.Euler(0, 0.6, 0.3), win: [0.69, 0.79],
  },
};

// Mobile: tighter exploded cloud so it clears the copy
const EXPLODE_SCALE = isMobile ? 0.55 : 1;
const engine = new THREE.Group();
scene.add(engine);
const groups = {};
for (const name of PART_ORDER) {
  const g = new THREE.Group();
  g.name = name;
  g.userData.part = name;
  engine.add(g);
  groups[name] = g;
}

const mesh = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  return m;
};
// Place a mesh in a bank's frame: along crank X, up the bore axis, offset across.
const inBank = (m, side, x, up) => {
  const d = bankDir(side);
  m.position.set(x, d.y * up, d.z * up);
  m.rotation.x = side * BANK; // rotating +Y about X by θ gives (0, cosθ, sinθ) = bankDir
  return m;
};

function buildProcedural() {
  const CYL_X = [-0.95, -0.32, 0.32, 0.95];

  // Block: crankcase + two angled banks with visible bores
  const b = groups.block;
  b.add(mesh(new THREE.BoxGeometry(2.7, 0.9, 1.15, 1, 1, 1), M.block, 0, -0.55, 0));
  b.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 32), M.alu, 1.5, -0.55, 0, 0, 0, Math.PI / 2)); // front pulley
  b.add(mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.18, 48), M.steel, -1.52, -0.55, 0, 0, 0, Math.PI / 2)); // flywheel
  for (const side of [-1, 1]) {
    const bank = inBank(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.95, 0.72), M.block), side, 0, 0.42);
    b.add(bank);
    for (const x of CYL_X) {
      const bore = inBank(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 32), M.dark), side, x, 0.9);
      b.add(bore);
    }
  }

  // Crank: shaft + a spinner (counterweights, journals) that rotates about the axis
  const c = groups.crank;
  c.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 2.9, 24), M.steel, 0, -0.55, 0, 0, 0, Math.PI / 2));
  const spinner = new THREE.Group(); spinner.position.set(0, -0.55, 0); spinner.name = "spinner"; c.add(spinner);
  CYL_X.forEach((x, i) => {
    const a = (i * Math.PI) / 2;
    const arm = new THREE.Group(); arm.position.x = x; arm.rotation.x = a;
    arm.add(mesh(new THREE.BoxGeometry(0.16, 0.5, 0.36), M.steel, 0, -0.14, 0));
    arm.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.24, 20), M.alu, 0, 0.16, 0, 0, 0, Math.PI / 2));
    spinner.add(arm);
  });

  // Pistons + rods, one group per bank
  for (const side of [-1, 1]) {
    const g = side < 0 ? groups.pistonsL : groups.pistonsR;
    CYL_X.forEach((x, i) => {
      const p = new THREE.Group();
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.2, 32), M.alu);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.012, 8, 40), M.dark); ring.rotation.x = Math.PI / 2; ring.position.y = 0.06;
      const rod = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.11), M.steel); rod.position.y = -0.4;
      p.add(crown, ring, rod);
      inBank(p, side, x, 0.95);
      p.userData.phase = (i * Math.PI) / 2 + (side > 0 ? Math.PI / 4 : 0);
      p.userData.side = side; p.userData.x = x;
      g.add(p);
    });
  }

  // Heads + cam covers with a volt stripe
  const h = groups.heads;
  for (const side of [-1, 1]) {
    h.add(inBank(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.26, 0.74), M.alu), side, 0, 1.08));
    h.add(inBank(new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.22, 0.6), M.carbon), side, 0, 1.32));
    const stripe = inBank(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.02, 0.08), M.volt), side, 0, 1.44);
    stripe.userData.glow = true;
    h.add(stripe);
  }

  // Intake: plenum + 8 runners/throttle bodies
  const n = groups.intake;
  n.add(mesh(new THREE.BoxGeometry(2.1, 0.3, 0.9), M.carbon, 0, 1.25, 0));
  n.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 24), M.alu, 0, 1.52, 0, 0, 0, Math.PI / 2));
  for (const side of [-1, 1]) for (const x of CYL_X) {
    n.add(inBank(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.42, 20), M.alu), side, x, 1.55));
    const trumpet = inBank(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.09, 0.12, 20), M.steel), side, x, 1.8);
    n.add(trumpet);
  }

  // Harness: ECU box + volt wire tubes running to each cylinder
  const w = groups.harness;
  const ecu = mesh(new THREE.BoxGeometry(0.5, 0.12, 0.34), M.carbon, -0.9, 1.2, 0.95);
  w.add(ecu);
  const ecuLight = mesh(new THREE.BoxGeometry(0.42, 0.01, 0.04), M.volt, -0.9, 1.265, 0.95); ecuLight.userData.glow = true; w.add(ecuLight);
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: VOLT, emissiveIntensity: 0, roughness: 0.6 });
  for (const side of [-1, 1]) for (const x of CYL_X) {
    const d = bankDir(side);
    const pts = [
      new THREE.Vector3(-0.9, 1.2, 0.95),
      new THREE.Vector3((x - 0.9) * 0.5, 1.75, 0.7 * side + 0.2),
      new THREE.Vector3(x, d.y * 1.5, d.z * 1.5),
    ];
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.018, 8, false), wireMat);
    tube.userData.glow = true;
    w.add(tube);
  }

  // Headers: 4 primaries per bank into a collector
  const hd = groups.headers;
  for (const side of [-1, 1]) {
    const d = bankDir(side);
    for (const x of CYL_X) {
      const pts = [
        new THREE.Vector3(x, d.y * 0.55, d.z * 0.55 + side * 0.36),
        new THREE.Vector3(x, 0.15, side * 1.15),
        new THREE.Vector3(x * 0.7 - 0.5, -0.5, side * 1.25),
        new THREE.Vector3(-1.4, -0.8, side * 1.05),
      ];
      hd.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.065, 12, false), M.hot));
    }
    hd.add(mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.7, 20), M.hot, -1.75, -0.8, side * 1.05, 0, 0, Math.PI / 2));
  }

  // Turbo: compressor + turbine housings, shaft, wastegate
  const t = groups.turbo;
  t.add(mesh(new THREE.TorusGeometry(0.34, 0.15, 16, 48), M.alu, 1.95, -0.3, 0.9, 0, Math.PI / 2, 0));
  t.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 32), M.alu, 1.95, -0.3, 0.9, 0, 0, Math.PI / 2));
  const wheel = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 12), M.steel, 2.2, -0.3, 0.9, 0, 0, Math.PI / 2);
  wheel.userData.spin = true; t.add(wheel);
  const hotHousing = mesh(new THREE.TorusGeometry(0.3, 0.14, 16, 48), M.hot, 1.95, -0.3, 0.45, 0, Math.PI / 2, 0);
  t.add(hotHousing);
  t.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.9, 20), M.hot, 1.95, -0.6, 0.7, Math.PI / 3, 0, 0)); // downpipe
  t.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 20), M.alu, 2.35, -0.3, 0.9, 0, 0, Math.PI / 2)); // inlet
}

async function loadModel(url) {
  const draco = new DRACOLoader(); draco.setDecoderPath("assets/vendor/addons/libs/draco/");
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync(url);
  // Top-level nodes named after PART_ORDER land in their groups; anything else goes in the block.
  for (const child of [...gltf.scene.children]) (groups[child.name] ?? groups.block).add(child);
}

if (MODEL_URL) loadModel(MODEL_URL).catch((e) => { console.warn("[engine] model failed, using procedural", e); buildProcedural(); });
else buildProcedural();

// Every mesh remembers its group so hover can find it.
engine.traverse((o) => { if (o.isMesh) { let p = o; while (p && !p.userData.part) p = p.parent; o.userData.part = p?.userData.part; } });

/* ---------- Camera script: authored keyframes, eased by scroll ---------- */
const SHOTS = [
  { t: 0.00, pos: [10.4, 3.6, 14.6], look: [-3.2, 1.0, 0], fov: 34 }, // hero: full exploded cloud, right of frame
  { t: 0.16, pos: [6.0, 1.4, 11.8], look: [-1.7, -0.1, 0], fov: 38 }, // block
  { t: 0.30, pos: [-6.0, -0.4, 9.6], look: [-1.4, -0.6, 0], fov: 40 }, // crank, low
  { t: 0.46, pos: [3.4, 5.8, 8.8], look: [-1.6, 1.0, 0], fov: 38 }, // top end
  { t: 0.60, pos: [-4.0, 4.2, 10.0], look: [-1.4, 0.9, 0.4], fov: 38 }, // harness
  { t: 0.72, pos: [9.4, 1.4, 5.6], look: [-0.6, 0.0, 0.4], fov: 40 }, // headers / turbo
  { t: 0.84, pos: [0.0, 2.8, 12.8], look: [0, -1.7, 0], fov: 34 }, // pricing: complete engine above the panel
  { t: 1.00, pos: [3.6, 2.4, 10.8], look: [0.2, -1.6, 0], fov: 36 }, // ignition: fired engine above the form
];
const ease = (x) => x * x * (3 - 2 * x);
const shotAt = (t, out) => {
  let a = SHOTS[0], b = SHOTS[SHOTS.length - 1];
  for (let i = 0; i < SHOTS.length - 1; i++) if (t >= SHOTS[i].t && t <= SHOTS[i + 1].t) { a = SHOTS[i]; b = SHOTS[i + 1]; break; }
  const k = ease(THREE.MathUtils.clamp((t - a.t) / Math.max(1e-4, b.t - a.t), 0, 1));
  for (let i = 0; i < 3; i++) { out.pos[i] = a.pos[i] + (b.pos[i] - a.pos[i]) * k; out.look[i] = a.look[i] + (b.look[i] - a.look[i]) * k; }
  out.fov = a.fov + (b.fov - a.fov) * k;
  return out;
};

/* ---------- Post ---------- */
let composer = null, bloom = null;
if (!isMobile) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.4, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

/* ---------- Scroll + pointer state ---------- */
const state = { target: 0, p: 0, mx: 0, my: 0, px: 0, py: 0, fire: 0, rpm: 0, crank: 0 };
const readScroll = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  state.target = max > 0 ? THREE.MathUtils.clamp(scrollY / max, 0, 1) : 0;
};
addEventListener("scroll", readScroll, { passive: true });
addEventListener("pointermove", (e) => {
  state.mx = (e.clientX / innerWidth - 0.5) * 2; state.my = (e.clientY / innerHeight - 0.5) * 2;
  state.px = e.clientX; state.py = e.clientY; pointerDirty = true;
}, { passive: true });
readScroll();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer && composer.setSize(innerWidth, innerHeight); readScroll();
});

/* ---------- Hover hotspots ---------- */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let pointerDirty = false, hovered = null;
const tmpV = new THREE.Vector3();
const setHover = (name) => {
  if (name === hovered) return;
  hovered = name;
  for (const n of PART_ORDER) groups[n].userData.hot = n === name;
  if (!hotspot) return;
  if (!name) { hotspot.hidden = true; return; }
  const P = PARTS[name];
  hotspot.querySelector("b").textContent = P.label;
  hotspot.querySelector("span").textContent = P.service;
  hotspot.querySelector("small").textContent = P.note;
  hotspot.hidden = false;
};

/* ---------- HUD ---------- */
const hud = {
  asm: document.querySelector("[data-hud=asm]"),
  sector: document.querySelector("[data-hud=sector]"),
  rpm: document.querySelector("[data-hud=rpm]"),
  bar: document.querySelector("[data-hud=bar]"),
};
const sections = [...document.querySelectorAll("[data-sector]")];

/* ---------- Frame ---------- */
const shot = { pos: [0, 0, 0], look: [0, 0, 0], fov: 40 };
const camTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3(), lookCur = new THREE.Vector3(-0.9, 0.3, 0);
let last = performance.now() / 1000, elapsed = 0;
const box = new THREE.Box3();

function frame(now) {
  now /= 1000;
  const dt = THREE.MathUtils.clamp(now - last, 0, 0.05); last = now; elapsed += dt;
  const t = elapsed;

  // damped scroll follow
  state.p += (state.target - state.p) * (1 - Math.exp(-dt * 6));
  const p = state.p;

  // assembly: each group eases from exploded to seated inside its window
  let seated = 0;
  for (const name of PART_ORDER) {
    const g = groups[name], P = PARTS[name];
    const k = ease(THREE.MathUtils.clamp((p - P.win[0]) / (P.win[1] - P.win[0]), 0, 1));
    seated += k;
    const drift = (1 - k) * (reduceMotion ? 0 : 1);
    const i = PART_ORDER.indexOf(name);
    g.position.copy(P.explode).multiplyScalar((1 - k) * EXPLODE_SCALE);
    g.position.x += Math.sin(t * 0.5 + i) * 0.06 * drift;
    g.position.y += Math.cos(t * 0.4 + i * 1.3) * 0.08 * drift;
    g.rotation.set(P.rot.x * (1 - k) + Math.sin(t * 0.3 + i) * 0.02 * drift, P.rot.y * (1 - k), P.rot.z * (1 - k));
    // seat "click": a tiny overshoot right as it lands
    if (k > 0.9 && k < 1) { const s = 1 + Math.sin((k - 0.9) * 10 * Math.PI) * 0.015; g.scale.setScalar(s); } else g.scale.setScalar(1);
  }
  const assembly = seated / PART_ORDER.length;

  // whole engine: slow turn while exploded, settles as it assembles; pointer parallax
  const turn = (1 - ease(THREE.MathUtils.clamp(p / 0.3, 0, 1)));
  engine.rotation.y = Math.sin(t * 0.15) * 0.25 * turn + state.mx * 0.05;
  // hero: the exploded cloud sits right of the headline, then drifts back to centre as it assembles
  engine.position.x = (isMobile ? 0.6 : 2.6) * (1 - ease(THREE.MathUtils.clamp(p / 0.16, 0, 1)));
  engine.rotation.x = state.my * -0.02;

  // ignition after everything is seated
  const fireTarget = p > 0.88 ? THREE.MathUtils.clamp((p - 0.88) / 0.08, 0, 1) : 0;
  state.fire += (fireTarget - state.fire) * (1 - Math.exp(-dt * 3));
  const fire = state.fire;
  state.rpm += ((fire > 0 ? 900 + fire * 7500 : 0) - state.rpm) * (1 - Math.exp(-dt * 2));
  const omega = fire > 0.02 ? (state.rpm / 60) * 2 * Math.PI * 0.08 : 0; // slowed for the eye
  state.crank += omega * dt;
  groups.crank.getObjectByName("spinner").rotation.x = state.crank;
  // pistons reciprocate along the bore
  for (const g of [groups.pistonsL, groups.pistonsR]) {
    for (const pst of g.children) {
      const d = bankDir(pst.userData.side);
      const sN = 0.95 + Math.sin(state.crank + pst.userData.phase) * 0.14 * fire;
      pst.position.set(pst.userData.x, d.y * sN, d.z * sN);
    }
  }

  // glow: harness/stripes light up when the harness seats; headers and turbo glow with fire
  const harnessK = ease(THREE.MathUtils.clamp((p - PARTS.harness.win[0]) / (PARTS.harness.win[1] - PARTS.harness.win[0]), 0, 1));
  M.volt.emissiveIntensity = 0.3 * harnessK + 1.6 * fire * (0.75 + 0.25 * Math.sin(t * 9));
  engine.traverse((o) => { if (o.isMesh && o.material.emissive && o.userData.glow && o.material !== M.volt) o.material.emissiveIntensity = M.volt.emissiveIntensity * 0.8; });
  M.hot.emissiveIntensity = fire * (0.35 + 0.15 * Math.sin(t * 6));
  M.hot.color.setHex(0x3a3d42).lerp(new THREE.Color(0x6b4a2a), fire * 0.6);
  floor.material.uniforms.uTime.value = t; floor.material.uniforms.uFire.value = fire;
  engine.traverse((o) => { if (o.userData.spin) o.rotation.x += dt * (2 + fire * 40); });
  if (bloom) bloom.strength = 0.35 + fire * 0.5;

  // camera
  shotAt(p, shot);
  camTarget.set(...shot.pos); lookTarget.set(...shot.look);
  if (isMobile) { camTarget.multiplyScalar(1.5); lookTarget.y += 3.0; }
  camTarget.x += state.mx * 0.25; camTarget.y += state.my * -0.15;
  camera.position.lerp(camTarget, 1 - Math.exp(-dt * 5));
  lookCur.lerp(lookTarget, 1 - Math.exp(-dt * 5));
  camera.lookAt(lookCur);
  camera.fov += (shot.fov - camera.fov) * (1 - Math.exp(-dt * 5));
  camera.updateProjectionMatrix();

  // raycast for hotspots (only when pointer moved)
  if ((pointerDirty || hovered) && !isMobile && state.px) {
    pointerDirty = false;
    ndc.set((state.px / innerWidth) * 2 - 1, -(state.py / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(engine, true)[0];
    const overPanel = document.elementFromPoint(state.px, state.py)?.closest(".panel, .nav, .hud, form");
    setHover(hit && !overPanel ? hit.object.userData.part : null);
  }
  if (hovered && hotspot && !hotspot.hidden) {
    box.setFromObject(groups[hovered]).getCenter(tmpV).project(camera);
    hotspot.style.transform = `translate(${(tmpV.x * 0.5 + 0.5) * innerWidth + 18}px, ${(-tmpV.y * 0.5 + 0.5) * innerHeight - 18}px)`;
  }
  // hovered group lifts toward the camera a touch
  for (const name of PART_ORDER) {
    const g = groups[name];
    g.userData.lift = (g.userData.lift ?? 0) + ((g.userData.hot ? 1 : 0) - (g.userData.lift ?? 0)) * (1 - Math.exp(-dt * 10));
    if (g.userData.lift > 0.001) { g.scale.multiplyScalar(1 + 0.03 * g.userData.lift); g.position.addScaledVector(tmpV.copy(camera.position).normalize(), 0.12 * g.userData.lift); }
  }

  // HUD + active sector
  let active = 0;
  for (let i = 0; i < sections.length; i++) if (sections[i].getBoundingClientRect().top < innerHeight * 0.55) active = i;
  sections.forEach((s, i) => s.classList.toggle("is-active", i === active));
  if (hud.asm) hud.asm.textContent = `${String(Math.round(assembly * 100)).padStart(3, "0")}%`;
  if (hud.sector) hud.sector.textContent = `S${String(active + 1).padStart(2, "0")}`;
  if (hud.rpm) hud.rpm.textContent = String(Math.round(state.rpm)).padStart(4, "0");
  if (hud.bar) hud.bar.style.transform = `scaleX(${p})`;
  document.documentElement.style.setProperty("--fire", fire.toFixed(3));

  composer ? composer.render() : renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
document.documentElement.classList.add("gl-ready");
window.__lc = { camera, engine, state, groups, lookCur, renderer };
