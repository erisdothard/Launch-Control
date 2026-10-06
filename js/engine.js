// Launch Control: "The Engine"
// One fixed WebGL canvas. A V8 floats exploded in the hero and assembles as
// you scroll: each part group seats inside its own scroll window, so the
// scrollbar is the playhead. At the end it fires. Native scroll only.
//
// The engine is built procedurally with real detail (cast block with ribs
// and bolt bosses, finned covers, I-beam rods, lathe-profiled pulleys and
// velocity stacks, a volute turbo) and lit like a studio shot: one hard key
// with shadows, a volt rim, depth of field, no grid. To swap in a modelled
// GLB later, name its top-level nodes after PART_ORDER and set MODEL_URL.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const MODEL_URL = ""; // e.g. "assets/models/engine.glb". Empty = procedural engine.

const VOLT = new THREE.Color("#e4572e"); // the one signal: marshal orange-red
const isMobile = matchMedia("(max-width: 900px)").matches;
const canvas = document.getElementById("gl");
// ?nogl renders the page with the engine off: the brand has to hold on its own.
if (new URLSearchParams(location.search).has("nogl") || isMobile) { canvas.remove(); throw new Error("engine off: " + (isMobile ? "mobile" : "?nogl")); }
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const hotspot = null;

/* ================= Renderer / scene ================= */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#f4f2ec");
scene.fog = new THREE.FogExp2(0xf4f2ec, 0.05);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 80);

// Studio lighting: one hard key from high right with shadows, a cool fill, a volt rim from behind.
const key = new THREE.DirectionalLight(0xfff7ec, 2.4);
key.position.set(6, 9, 4);
key.castShadow = true;
key.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -9;
key.shadow.camera.right = key.shadow.camera.top = 9;
key.shadow.camera.near = 1; key.shadow.camera.far = 30;
key.shadow.bias = -0.0008; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
scene.add(key);
const fill = new THREE.DirectionalLight(0xdfe6f0, 0.9); fill.position.set(-7, 3, 2); scene.add(fill);
const rim = new THREE.SpotLight(0xffffff, 10, 40, Math.PI / 5, 0.6, 1.2); rim.position.set(-5, 4, -8); rim.target.position.set(0, 0, 0); scene.add(rim, rim.target);
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

// Floor: dark studio sweep. Receives the shadow pool; fog eats the edges.
const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.ShadowMaterial({ opacity: 0.18 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -2.3; floor.receiveShadow = true;
scene.add(floor);
// Ignition pulse ring on the floor (invisible until it fires)
const pulse = new THREE.Mesh(new THREE.RingGeometry(0.1, 8, 96), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uT: { value: 0 }, uFire: { value: 0 }, uVolt: { value: VOLT } },
  vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `precision highp float; varying vec2 vP; uniform float uT,uFire; uniform vec3 uVolt;
    void main(){ float d = length(vP); float w = smoothstep(0.985,1.0,sin(d*2.2 - uT*4.0)); float fade = smoothstep(8.0,1.0,d) * smoothstep(0.6,1.6,d); gl_FragColor = vec4(uVolt, w*fade*uFire*0.35); }`,
}));
pulse.rotation.x = -Math.PI / 2; pulse.position.y = -2.29; scene.add(pulse);

/* ================= Procedural surface textures ================= */
function noiseCanvas(size, scale, lo, hi) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const ctx = c.getContext("2d"); const img = ctx.createImageData(size, size);
  const rnd = new Float32Array(size * size);
  for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = 1, f = scale, norm = 0;
    for (let o = 0; o < 4; o++) { const sx = (x * f / size) | 0, sy = (y * f / size) | 0; v += rnd[((sy % size) * size + (sx % size))] * amp; norm += amp; amp *= 0.5; f *= 2; }
    v = lo + (hi - lo) * (v / norm);
    const i = (y * size + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const castRough = noiseCanvas(256, 24, 0.55, 0.9);
const castBump = noiseCanvas(256, 48, 0.3, 0.7);
const brushRough = (() => {
  const c = document.createElement("canvas"); c.width = 512; c.height = 64; const ctx = c.getContext("2d");
  for (let y = 0; y < 64; y++) { const v = 40 + Math.random() * 60; ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(0, y, 512, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 6); return t;
})();

/* ================= Materials ================= */
const M = {
  cast: new THREE.MeshPhysicalMaterial({ color: 0x3a3d42, metalness: 0.75, roughness: 0.72, roughnessMap: castRough, bumpMap: castBump, bumpScale: 0.012 }),
  castDark: new THREE.MeshPhysicalMaterial({ color: 0x24262a, metalness: 0.7, roughness: 0.8, roughnessMap: castRough, bumpMap: castBump, bumpScale: 0.01 }),
  alu: new THREE.MeshPhysicalMaterial({ color: 0x6e737a, metalness: 1.0, roughness: 0.46, roughnessMap: brushRough, anisotropy: 0.6 }),
  machined: new THREE.MeshPhysicalMaterial({ color: 0xaeb3b8, metalness: 1.0, roughness: 0.3, clearcoat: 0.25, clearcoatRoughness: 0.3 }),
  steel: new THREE.MeshPhysicalMaterial({ color: 0x6a6f76, metalness: 1.0, roughness: 0.32 }),
  black: new THREE.MeshPhysicalMaterial({ color: 0x141311, metalness: 0.4, roughness: 0.55, clearcoat: 0.8, clearcoatRoughness: 0.25 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, metalness: 0, roughness: 0.95 }),
  volt: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: VOLT, emissiveIntensity: 0, metalness: 0.2, roughness: 0.4 }),
  hot: new THREE.MeshPhysicalMaterial({ color: 0x4a4f57, metalness: 1.0, roughness: 0.38, emissive: 0xff5a1a, emissiveIntensity: 0 }),
  wire: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: VOLT, emissiveIntensity: 0, roughness: 0.7 }),
};

/* ================= Part groups ================= */
const BANK = Math.PI / 4;
const bankDir = (side) => new THREE.Vector3(0, Math.cos(BANK), side * Math.sin(BANK));
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const e = (x, y, z) => new THREE.Euler(x, y, z);
const PART_ORDER = ["block", "crank", "pistonsL", "pistonsR", "heads", "intake", "harness", "headers", "turbo"];
const PARTS = {
  block:    { label: "Block", service: "CRM & sales infrastructure", note: "The thing everything bolts to.", explode: v(0, -0.5, 0.9), rot: e(0.08, -0.25, 0.05), win: [0.10, 0.24] },
  crank:    { label: "Crankshaft", service: "Outbound business development", note: "Turns the work into motion.", explode: v(0.4, -1.5, 1.4), rot: e(0, 0, 0.25), win: [0.25, 0.35] },
  pistonsL: { label: "Pistons", service: "Lead generation", note: "The parts that do the work.", explode: bankDir(-1).multiplyScalar(2.6), rot: e(0, 0, 0), win: [0.29, 0.41] },
  pistonsR: { label: "Pistons", service: "Lead generation", note: "The parts that do the work.", explode: bankDir(1).multiplyScalar(2.6), rot: e(0, 0, 0), win: [0.31, 0.43] },
  heads:    { label: "Cylinder heads", service: "Positioning & messaging", note: "How attention gets in.", explode: v(0, 2.4, 0), rot: e(0.15, 0, -0.12), win: [0.40, 0.52] },
  intake:   { label: "Intake", service: "Web & digital presence", note: "The air the engine breathes.", explode: v(0, 4.2, -0.4), rot: e(0, 0.3, 0.1), win: [0.46, 0.58] },
  harness:  { label: "ECU & harness", service: "The Launch Control CRM", note: "The brain. Every signal logged.", explode: v(-1.2, 2.2, 2.2), rot: e(0.4, 0.2, 0), win: [0.54, 0.64] },
  headers:  { label: "Headers", service: "Follow-up", note: "Where the heat goes out.", explode: v(1.2, -0.4, 2.6), rot: e(-0.3, 0.2, 0), win: [0.64, 0.74] },
  turbo:    { label: "Turbo", service: "Growth strategy", note: "Boost. Where the power showed.", explode: v(3.4, 0.9, 0.6), rot: e(0, 0.6, 0.3), win: [0.69, 0.79] },
};

const EXPLODE_SCALE = isMobile ? 0.55 : 1;
const engine = new THREE.Group(); scene.add(engine);
const groups = {};
for (const name of PART_ORDER) { const g = new THREE.Group(); g.name = name; g.userData.part = name; engine.add(g); groups[name] = g; }

/* ---------- geometry helpers ---------- */
const CYL_X = [-0.95, -0.32, 0.32, 0.95];
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(1, 1, 1), tmpP = new THREE.Vector3();
// Collect transformed geometries per material, merge into one mesh per material: detail without draw calls.
class Builder {
  constructor(group) { this.group = group; this.bins = new Map(); }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = null) {
    // extrude/lathe are non-indexed, box/cylinder are indexed: normalise so they merge
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), tmpS.set(1, 1, 1));
    if (parent) tmpM.premultiply(parent);
    g.applyMatrix4(tmpM);
    if (!this.bins.has(mat)) this.bins.set(mat, []);
    this.bins.get(mat).push(g);
    return this;
  }
  flush(target = this.group) {
    for (const [mat, geos] of this.bins) {
      const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
      m.castShadow = true; m.receiveShadow = true; target.add(m);
    }
    this.bins.clear();
  }
}
const bankM = (side, x, up) => { const d = bankDir(side); return new THREE.Matrix4().compose(new THREE.Vector3(x, d.y * up, d.z * up), new THREE.Quaternion().setFromEuler(new THREE.Euler(side * BANK, 0, 0)), new THREE.Vector3(1, 1, 1)); };
const T4 = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const bevelBox = (w, h, d, r = 0.03) => {
  const s = new THREE.Shape(); const hw = w / 2, hh = h / 2;
  s.moveTo(-hw + r, -hh); s.lineTo(hw - r, -hh); s.quadraticCurveTo(hw, -hh, hw, -hh + r); s.lineTo(hw, hh - r); s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh); s.quadraticCurveTo(-hw, hh, -hw, hh - r); s.lineTo(-hw, -hh + r); s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -d / 2); return g;
};
const hexBolt = (r = 0.045, h = 0.05) => mergeGeometries([new THREE.CylinderGeometry(r, r, h, 6).toNonIndexed(), new THREE.CylinderGeometry(r * 0.75, r * 0.75, h * 0.3, 6).translate(0, h * 0.6, 0).toNonIndexed()]);
const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

function buildProcedural() {
  /* ---- Block ---- */
  const B = new Builder(groups.block);
  B.add(bevelBox(2.7, 0.9, 1.15, 0.04), M.cast, 0, -0.55, 0);
  B.add(bevelBox(2.3, 0.42, 0.95, 0.03), M.castDark, 0, -1.2, 0);
  for (let i = 0; i < 9; i++) B.add(new THREE.BoxGeometry(0.03, 0.34, 1.0), M.castDark, -1.1 + i * 0.275, -1.2, 0);
  for (const x of [-1.2, -0.6, 0, 0.6, 1.2]) for (const z of [-0.58, 0.58]) B.add(new THREE.BoxGeometry(0.1, 0.6, 0.05), M.cast, x, -0.5, z);
  B.add(lathe([[0, 0], [0.5, 0], [0.5, 0.06], [0.44, 0.08], [0.5, 0.1], [0.44, 0.12], [0.5, 0.14], [0.44, 0.16], [0.5, 0.18], [0.5, 0.24], [0.18, 0.26], [0.18, 0.34], [0, 0.34]]), M.machined, 1.36, -0.55, 0, 0, 0, -Math.PI / 2);
  B.add(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 64), M.steel, -1.42, -0.55, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2; B.add(new THREE.BoxGeometry(0.1, 0.05, 0.05), M.steel, -1.42, -0.55 + Math.cos(a) * 0.64, Math.sin(a) * 0.64, a, 0, 0); }
  for (const side of [-1, 1]) {
    B.add(bevelBox(2.6, 0.95, 0.72, 0.03), M.cast, 0, 0, 0, 0, 0, 0, bankM(side, 0, 0.42));
    for (const x of CYL_X) B.add(new THREE.CylinderGeometry(0.21, 0.21, 0.04, 40), M.castDark, 0, 0, 0, 0, 0, 0, bankM(side, x, 0.9));
    for (const x of [-1.25, -0.63, 0, 0.63, 1.25]) for (const zz of [-0.3, 0.3]) B.add(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 12), M.cast, 0, 0, 0, 0, 0, 0, bankM(side, x, 0.9).multiply(T4(0, 0, zz)));
    for (const x of [-0.95, 0, 0.95]) B.add(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 24), M.machined, 0, 0, 0, Math.PI / 2, 0, 0, bankM(side, x, 0.2).multiply(T4(0, 0, side * 0.37)));
  }
  B.flush();

  /* ---- Crank ---- */
  const C = new Builder(groups.crank);
  C.add(new THREE.CylinderGeometry(0.085, 0.085, 2.95, 32), M.machined, 0, -0.55, 0, 0, 0, Math.PI / 2);
  C.flush();
  const spinner = new THREE.Group(); spinner.position.set(0, -0.55, 0); spinner.name = "spinner"; groups.crank.add(spinner);
  const S = new Builder(spinner);
  const cw = (() => { const s = new THREE.Shape(); s.absarc(0, 0, 0.42, Math.PI * 0.62, Math.PI * 1.38, false); s.lineTo(-0.12, -0.05); s.lineTo(0.12, -0.05); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1 }); })();
  CYL_X.forEach((x, i) => {
    const arm = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler((i * Math.PI) / 2, 0, 0)), new THREE.Vector3(1, 1, 1));
    S.add(cw, M.steel, 0, 0, -0.07, 0, Math.PI / 2, 0, arm);
    S.add(new THREE.CylinderGeometry(0.075, 0.075, 0.26, 24), M.machined, 0, 0.18, 0, 0, 0, Math.PI / 2, arm);
  });
  S.flush();

  /* ---- Pistons ---- */
  const ibeam = (() => { const s = new THREE.Shape(); const w = 0.05, f = 0.11, t = 0.02; s.moveTo(-f, -0.33); s.lineTo(f, -0.33); s.lineTo(f, -0.33 + t); s.lineTo(w / 2, -0.33 + t); s.lineTo(w / 2, 0.08 - t); s.lineTo(f * 0.7, 0.08 - t); s.lineTo(f * 0.7, 0.08); s.lineTo(-f * 0.7, 0.08); s.lineTo(-f * 0.7, 0.08 - t); s.lineTo(-w / 2, 0.08 - t); s.lineTo(-w / 2, -0.33 + t); s.lineTo(-f, -0.33 + t); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false }).translate(0, 0, -0.025); })();
  for (const side of [-1, 1]) {
    const g = side < 0 ? groups.pistonsL : groups.pistonsR;
    CYL_X.forEach((x, i) => {
      const p = new THREE.Group(); const P = new Builder(p);
      P.add(new THREE.CylinderGeometry(0.185, 0.185, 0.22, 48), M.machined, 0, 0, 0);
      P.add(new THREE.CylinderGeometry(0.045, 0.045, 0.004, 24), M.steel, -0.075, 0.111, 0.045); P.add(new THREE.CylinderGeometry(0.045, 0.045, 0.004, 24), M.steel, 0.075, 0.111, -0.045);
      for (const yy of [0.07, 0.04, 0.0]) P.add(new THREE.TorusGeometry(0.185, 0.008, 6, 48), M.rubber, 0, yy, 0, Math.PI / 2, 0, 0);
      P.add(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 16), M.steel, 0, -0.14, 0, Math.PI / 2, 0, 0);
      P.add(ibeam, M.steel, 0, -0.2, 0);
      P.add(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 24), M.steel, 0, -0.53, 0, Math.PI / 2, 0, 0);
      P.flush();
      const d = bankDir(side); p.position.set(x, d.y * 0.95, d.z * 0.95); p.rotation.x = side * BANK;
      p.userData = { phase: (i * Math.PI) / 2 + (side > 0 ? Math.PI / 4 : 0), side, x };
      g.add(p);
    });
  }

  /* ---- Heads ---- */
  const H = new Builder(groups.heads);
  for (const side of [-1, 1]) {
    H.add(bevelBox(2.6, 0.26, 0.74, 0.03), M.cast, 0, 0, 0, 0, 0, 0, bankM(side, 0, 1.08));
    H.add(bevelBox(2.3, 0.2, 0.6, 0.05), M.black, 0, 0, 0, 0, 0, 0, bankM(side, 0, 1.32));
    for (let i = 0; i < 11; i++) H.add(new THREE.BoxGeometry(0.02, 0.07, 0.56), M.black, 0, 0, 0, 0, 0, 0, bankM(side, -1.0 + i * 0.2, 1.45));
    for (const x of [-1.05, -0.35, 0.35, 1.05]) for (const zz of [-0.24, 0.24]) H.add(hexBolt(0.035, 0.04), M.machined, 0, 0, 0, 0, 0, 0, bankM(side, x, 1.43).multiply(T4(0, 0, zz)));
  }
  H.flush();
  for (const side of [-1, 1]) { const plate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.012, 0.09), M.volt); plate.applyMatrix4(bankM(side, 0, 1.44)); groups.heads.add(plate); }

  /* ---- Intake ---- */
  const I = new Builder(groups.intake);
  I.add(bevelBox(2.1, 0.3, 0.9, 0.08), M.cast, 0, 1.25, 0);
  I.add(new THREE.CylinderGeometry(0.2, 0.2, 2.2, 32), M.alu, 0, 1.52, 0, 0, 0, Math.PI / 2);
  for (const x of [-0.7, 0, 0.7]) I.add(new THREE.TorusGeometry(0.21, 0.02, 8, 32), M.machined, x, 1.52, 0, 0, Math.PI / 2, 0);
  const stack = lathe([[0.085, 0], [0.085, 0.3], [0.1, 0.36], [0.14, 0.42], [0.19, 0.45], [0.2, 0.46], [0.17, 0.46], [0.12, 0.43], [0.095, 0.37], [0.075, 0.3], [0.075, 0]], 40);
  for (const side of [-1, 1]) for (const x of CYL_X) { I.add(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 24), M.alu, 0, 0, 0, 0, 0, 0, bankM(side, x, 1.52)); I.add(stack, M.machined, 0, 0, 0, 0, 0, 0, bankM(side, x, 1.6)); }
  I.add(new THREE.CylinderGeometry(0.015, 0.015, 2.0, 8), M.steel, 0, 1.72, 0.3, 0, 0, Math.PI / 2);
  I.flush();

  /* ---- Harness ---- */
  const W = new Builder(groups.harness);
  W.add(bevelBox(0.5, 0.12, 0.34, 0.02), M.black, -0.9, 1.2, 0.95);
  for (let i = 0; i < 7; i++) W.add(new THREE.BoxGeometry(0.44, 0.03, 0.015), M.alu, -0.9, 1.275, 0.82 + i * 0.045);
  W.add(new THREE.BoxGeometry(0.16, 0.08, 0.1), M.rubber, -1.2, 1.2, 0.95);
  W.flush();
  const ecuLight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.008, 0.02), M.volt); ecuLight.position.set(-0.9, 1.265, 1.13); groups.harness.add(ecuLight);
  const looms = [];
  for (const side of [-1, 1]) for (const x of CYL_X) { const d = bankDir(side); looms.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-1.05, 1.2, 0.95), new THREE.Vector3(-0.6 + x * 0.3, 1.9, 0.5 * side + 0.3), new THREE.Vector3(x, d.y * 1.52, d.z * 1.52)]), 28, 0.016, 8, false)); }
  const loomMesh = new THREE.Mesh(mergeGeometries(looms.map((g) => g.toNonIndexed())), M.wire); loomMesh.castShadow = true; groups.harness.add(loomMesh);

  /* ---- Headers ---- */
  const Hd = new Builder(groups.headers);
  for (const side of [-1, 1]) {
    const d = bankDir(side);
    for (const x of CYL_X) {
      Hd.add(new THREE.BoxGeometry(0.26, 0.12, 0.03), M.steel, 0, 0, 0, 0, 0, 0, bankM(side, x, 0.6).multiply(T4(0, 0, side * 0.38)));
      Hd.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x, d.y * 0.6, d.z * 0.6 + side * 0.4), new THREE.Vector3(x + 0.05, 0.3, side * 1.2), new THREE.Vector3(x * 0.6 - 0.5, -0.45, side * 1.3), new THREE.Vector3(-1.45, -0.85, side * 1.1)]), 48, 0.066, 16, false), M.hot);
    }
    Hd.add(lathe([[0.2, 0], [0.2, 0.3], [0.13, 0.55], [0.13, 0.75], [0.15, 0.78], [0.11, 0.78], [0.11, 0.55], [0.17, 0.3], [0.17, 0]], 32), M.hot, -1.55, -0.85, side * 1.1, 0, 0, Math.PI / 2);
  }
  Hd.flush();

  /* ---- Turbo ---- */
  const T = new Builder(groups.turbo);
  const volute = (r0, r1, tubeR0, tubeR1, segs = 64) => {
    const pts = []; for (let i = 0; i <= segs; i++) { const a = (i / segs) * Math.PI * 1.85; const r = r0 + (r1 - r0) * (i / segs); pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
    const parts = []; const n = 24;
    for (let i = 0; i < n; i++) { const sub = new THREE.CatmullRomCurve3(pts.slice(Math.floor(i * segs / n), Math.floor((i + 1) * segs / n) + 1)); parts.push(new THREE.TubeGeometry(sub, 6, tubeR0 + (tubeR1 - tubeR0) * (i / n), 20, false)); }
    return mergeGeometries(parts.map((g) => g.toNonIndexed()));
  };
  const tx = 1.95, ty = -0.3, tz = 0.9;
  T.add(volute(0.28, 0.4, 0.2, 0.1), M.alu, tx, ty, tz + 0.12, 0, Math.PI / 2, 0);
  T.add(volute(0.26, 0.36, 0.17, 0.09), M.hot, tx, ty, tz - 0.42, 0, -Math.PI / 2, 0);
  T.add(lathe([[0.1, -0.2], [0.16, -0.14], [0.16, 0.14], [0.1, 0.2], [0, 0.2], [0, -0.2]], 32), M.cast, tx, ty, tz - 0.15, Math.PI / 2, 0, 0);
  T.add(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 32), M.machined, tx, ty, tz + 0.46, Math.PI / 2, 0, 0);
  T.add(new THREE.CylinderGeometry(0.11, 0.11, 0.7, 20), M.hot, tx, ty - 0.35, tz - 0.6, Math.PI / 3, 0, 0);
  T.add(bevelBox(0.18, 0.26, 0.12, 0.02), M.steel, tx + 0.1, ty + 0.4, tz - 0.3); T.add(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 8), M.machined, tx + 0.1, ty + 0.2, tz - 0.3);
  T.flush();
  const wheel = new THREE.Group(); wheel.position.set(tx, ty, tz + 0.3); wheel.rotation.x = Math.PI / 2;
  const Wh = new Builder(wheel); Wh.add(new THREE.CylinderGeometry(0.05, 0.14, 0.14, 24), M.machined, 0, 0, 0);
  for (let i = 0; i < 11; i++) Wh.add(new THREE.BoxGeometry(0.01, 0.14, 0.12), M.machined, Math.cos((i / 11) * Math.PI * 2) * 0.1, 0, Math.sin((i / 11) * Math.PI * 2) * 0.1, 0, -(i / 11) * Math.PI * 2 + 0.5, 0);
  Wh.flush(); wheel.userData.spin = true; groups.turbo.add(wheel);
}

async function loadModel(url) {
  const draco = new DRACOLoader(); draco.setDecoderPath("assets/vendor/addons/libs/draco/");
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync(url);
  gltf.scene.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  for (const child of [...gltf.scene.children]) (groups[child.name] ?? groups.block).add(child);
}
if (MODEL_URL) loadModel(MODEL_URL).catch((err) => { console.warn("[engine] model failed, using procedural", err); buildProcedural(); });
else buildProcedural();
engine.traverse((o) => { if (o.isMesh) { let p = o; while (p && !p.userData.part) p = p.parent; o.userData.part = p?.userData.part; } });

/* ================= Camera script ================= */
// Alternates the engine between sides so the page isn't one template: look.x negative puts the engine right of frame.
const SHOTS = [
  { t: 0.00, pos: [10.8, 3.4, 15.8], look: [-4.2, 0.9, 0], fov: 32 },
  { t: 0.16, pos: [1.5, 1.2, 12.5], look: [0.0, -0.2, 0], fov: 36 },
  { t: 0.30, pos: [6.4, -0.6, 9.4], look: [-2.2, -0.5, 0], fov: 40 },
  { t: 0.46, pos: [-3.6, 5.8, 8.8], look: [2.4, 1.0, 0], fov: 38 },
  { t: 0.60, pos: [4.4, 4.2, 9.8], look: [-2.2, 0.9, 0.4], fov: 38 },
  { t: 0.72, pos: [9.2, 1.6, 6.0], look: [0.4, 0.0, 0.4], fov: 40 },
  { t: 0.84, pos: [0.0, 2.8, 12.6], look: [0, -1.7, 0], fov: 34 },
  { t: 1.00, pos: [3.6, 2.4, 10.8], look: [0.2, -1.6, 0], fov: 36 },
];
const ease = (x) => x * x * (3 - 2 * x);
const shotAt = (t, out) => {
  let a = SHOTS[0], b = SHOTS[SHOTS.length - 1];
  for (let i = 0; i < SHOTS.length - 1; i++) if (t >= SHOTS[i].t && t <= SHOTS[i + 1].t) { a = SHOTS[i]; b = SHOTS[i + 1]; break; }
  const k = ease(THREE.MathUtils.clamp((t - a.t) / Math.max(1e-4, b.t - a.t), 0, 1));
  for (let i = 0; i < 3; i++) { out.pos[i] = a.pos[i] + (b.pos[i] - a.pos[i]) * k; out.look[i] = a.look[i] + (b.look[i] - a.look[i]) * k; }
  out.fov = a.fov + (b.fov - a.fov) * k; return out;
};

/* ================= Post ================= */
let composer = null, bloom = null, bokeh = null;
if (!isMobile) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bokeh = new BokehPass(scene, camera, { focus: 12, aperture: 0.00012, maxblur: 0.008 });
  composer.addPass(bokeh);
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.14, 0.45, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

/* ================= State ================= */
const state = { target: 0, p: 0, mx: 0, my: 0, px: 0, py: 0, fire: 0, rpm: 0, crank: 0 };
const readScroll = () => { const max = document.documentElement.scrollHeight - innerHeight; state.target = max > 0 ? THREE.MathUtils.clamp(scrollY / max, 0, 1) : 0; };
addEventListener("scroll", readScroll, { passive: true });
let pointerDirty = false, hovered = null;
addEventListener("pointermove", (ev) => { state.mx = (ev.clientX / innerWidth - 0.5) * 2; state.my = (ev.clientY / innerHeight - 0.5) * 2; state.px = ev.clientX; state.py = ev.clientY; pointerDirty = true; }, { passive: true });
readScroll();
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer && composer.setSize(innerWidth, innerHeight); readScroll(); });

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmpV = new THREE.Vector3(), box = new THREE.Box3();
const setHover = (name) => {
  if (name === hovered) return; hovered = name;
  for (const n of PART_ORDER) groups[n].userData.hot = n === name;
  if (!hotspot) return;
  if (!name) { hotspot.hidden = true; return; }
  const P = PARTS[name]; hotspot.querySelector("b").textContent = P.label; hotspot.querySelector("span").textContent = P.service; hotspot.querySelector("small").textContent = P.note; hotspot.hidden = false;
};
const hud = {};
const sections = [...document.querySelectorAll("[data-sector]")];

/* ================= Frame ================= */
const shot = { pos: [0, 0, 0], look: [0, 0, 0], fov: 36 };
const camTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3(), lookCur = new THREE.Vector3(-3.2, 1.0, 0);
let last = performance.now() / 1000, elapsed = 0;
const hotCol = new THREE.Color(0x4a4f57), hotFire = new THREE.Color(0x5a4a44);

function frame(now) {
  now /= 1000;
  const dt = THREE.MathUtils.clamp(now - last, 0, 0.05); last = now; elapsed += dt; const t = elapsed;
  state.p += (state.target - state.p) * (1 - Math.exp(-dt * 6)); const p = state.p;

  let seated = 0;
  PART_ORDER.forEach((name, i) => {
    const g = groups[name], P = PARTS[name];
    const k = ease(THREE.MathUtils.clamp((p - P.win[0]) / (P.win[1] - P.win[0]), 0, 1)); seated += k;
    const drift = (1 - k) * (reduceMotion ? 0 : 1);
    g.position.copy(P.explode).multiplyScalar((1 - k) * EXPLODE_SCALE);
    g.position.x += Math.sin(t * 0.5 + i) * 0.06 * drift; g.position.y += Math.cos(t * 0.4 + i * 1.3) * 0.08 * drift;
    g.rotation.set(P.rot.x * (1 - k) + Math.sin(t * 0.3 + i) * 0.02 * drift, P.rot.y * (1 - k), P.rot.z * (1 - k));
    g.scale.setScalar(k > 0.9 && k < 1 ? 1 + Math.sin((k - 0.9) * 10 * Math.PI) * 0.015 : 1);
  });
  const assembly = seated / PART_ORDER.length;

  const turn = 1 - ease(THREE.MathUtils.clamp(p / 0.3, 0, 1));
  engine.rotation.y = Math.sin(t * 0.15) * 0.25 * turn + state.mx * 0.05; engine.rotation.x = state.my * -0.02;
  engine.position.x = 0;

  const fireTarget = p > 0.88 ? THREE.MathUtils.clamp((p - 0.88) / 0.08, 0, 1) : 0;
  state.fire += (fireTarget - state.fire) * (1 - Math.exp(-dt * 3)); const fire = state.fire;
  state.rpm += ((fire > 0 ? 900 + fire * 7500 : 0) - state.rpm) * (1 - Math.exp(-dt * 2));
  state.crank += (fire > 0.02 ? (state.rpm / 60) * 2 * Math.PI * 0.08 : 0) * dt;
  groups.crank.getObjectByName("spinner").rotation.x = state.crank;
  for (const g of [groups.pistonsL, groups.pistonsR]) for (const pst of g.children) { const d = bankDir(pst.userData.side); const sN = 0.95 + Math.sin(state.crank + pst.userData.phase) * 0.14 * fire; pst.position.set(pst.userData.x, d.y * sN, d.z * sN); }

  const harnessK = ease(THREE.MathUtils.clamp((p - PARTS.harness.win[0]) / (PARTS.harness.win[1] - PARTS.harness.win[0]), 0, 1));
  M.volt.emissiveIntensity = 0.35 * harnessK + 1.4 * fire * (0.75 + 0.25 * Math.sin(t * 9));
  M.wire.emissiveIntensity = M.volt.emissiveIntensity * 0.7;
  M.hot.emissiveIntensity = fire * (0.28 + 0.1 * Math.sin(t * 6)); M.hot.color.copy(hotCol).lerp(hotFire, fire * 0.7);
  pulse.material.uniforms.uT.value = t; pulse.material.uniforms.uFire.value = fire * 0.5;
  rim.intensity = 10 + fire * 20;
  engine.traverse((o) => { if (o.userData.spin) o.rotation.y += dt * (2 + fire * 40); });
  if (bloom) bloom.strength = 0.14 + fire * 0.35;

  shotAt(p, shot); camTarget.set(...shot.pos); lookTarget.set(...shot.look);
  if (isMobile) { camTarget.multiplyScalar(1.5); lookTarget.y += 3.0; }
  camTarget.x += state.mx * 0.25; camTarget.y += state.my * -0.15;
  camera.position.lerp(camTarget, 1 - Math.exp(-dt * 5)); lookCur.lerp(lookTarget, 1 - Math.exp(-dt * 5)); camera.lookAt(lookCur);
  camera.fov += (shot.fov - camera.fov) * (1 - Math.exp(-dt * 5)); camera.updateProjectionMatrix();
  if (bokeh) bokeh.uniforms.focus.value = camera.position.distanceTo(engine.position);
  key.target.position.copy(engine.position); key.target.updateMatrixWorld();

  if ((pointerDirty || hovered) && !isMobile && state.px) {
    pointerDirty = false; ndc.set((state.px / innerWidth) * 2 - 1, -(state.py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(engine, true)[0];
    const overUI = document.elementFromPoint(state.px, state.py)?.closest(".copy, .masthead, form, .tiers, .statement, .results, .timing, .hero__type, .hero__aside");
    setHover(hit && !overUI ? hit.object.userData.part : null);
  }
  if (hovered && hotspot && !hotspot.hidden) { box.setFromObject(groups[hovered]).getCenter(tmpV).project(camera); hotspot.style.transform = `translate(${(tmpV.x * 0.5 + 0.5) * innerWidth + 18}px, ${(-tmpV.y * 0.5 + 0.5) * innerHeight - 18}px)`; }
  for (const name of PART_ORDER) { const g = groups[name]; g.userData.lift = (g.userData.lift ?? 0) + ((g.userData.hot ? 1 : 0) - (g.userData.lift ?? 0)) * (1 - Math.exp(-dt * 10)); if (g.userData.lift > 0.001) { g.scale.multiplyScalar(1 + 0.03 * g.userData.lift); g.position.addScaledVector(tmpV.copy(camera.position).normalize(), 0.12 * g.userData.lift); } }

  let active = 0; for (let i = 0; i < sections.length; i++) if (sections[i].getBoundingClientRect().top < innerHeight * 0.55) active = i;
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
window.__lc = { camera, engine, state, groups };
