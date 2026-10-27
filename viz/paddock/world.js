/* Launch Control Paddock: pixel-art isometric world renderer, night session.
   Logical canvas (tile 16x8) upscaled with smoothing off; HUD canvas at device resolution for crisp labels.
   Projection: sx = ox + (c - r) * 8, sy = oy + (c + r) * 4. Crew stand at tile centres. */
(function () {
  "use strict";
  const COLS = 24, ROWS = 16;
  const LW = 340, LH = 200, OX = 116, OY = 40;
  const K = {
    asphalt: "#1b1e23", lane: "#24282e", floor: "#30363e", floorLit: "#3a414a", concrete: "#20242a", grass: "#0f1612", track: "#16191d",
    wallA: "#3d444d", wallB: "#515963", wallC: "#2a2f36", wallD: "#1d2126", steel: "#c6ccd3", text: "#f4f6f8", white: "#e9ecef",
    yellow: "#f0c419", orange: "#f07d1a", red: "#e3261d", green: "#2bb24c", blue: "#9ec5e8", dark: "#0a0b0d", muted: "#7a8189",
    lamp: "#fff4cf", glass: "#243648", glassLit: "#4f7fa3", outline: "#23272d",
  };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DIG = { // 3x5 pixel digits
    0: ["111", "101", "101", "101", "111"], 1: ["010", "110", "010", "010", "111"], 2: ["111", "001", "111", "100", "111"], 3: ["111", "001", "111", "001", "111"],
    4: ["101", "101", "111", "001", "001"], 5: ["111", "100", "111", "001", "111"], 6: ["111", "100", "111", "101", "111"], 7: ["111", "001", "001", "010", "010"],
    8: ["111", "101", "111", "101", "111"], 9: ["111", "101", "111", "001", "111"],
  };

  /* ---------- grid ---------- */
  function walkable(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    if (r >= 1 && r <= 2 && c >= 3 && c <= 20) return true; // bay interiors
    if (r === 3) return true;                                  // apron
    if (r === 4 || r === 5) return true;                       // pit lane
    if (r === 6 && c <= 20) return true;                       // in front of the pit wall
    return false;
  }
  const STATIONS = {
    prospector: { desk: [5, 1] }, writer: { desk: [11, 1] }, strategist: { desk: [17, 1] },
    pitwallMC: { seat: [8, 7], front: [8, 6] }, pitwallEris: { seat: [12, 7], front: [12, 6] },
    tower: { guardian: [22, 7], front: [20, 5] }, radio: { front: [1, 3] }, board: { front: [21, 3] },
  };
  function findPath(a, b) {
    const key = (c, r) => c + "," + r;
    const start = [Math.round(a[0]), Math.round(a[1])], goal = [Math.round(b[0]), Math.round(b[1])];
    if (!walkable(start[0], start[1]) || !walkable(goal[0], goal[1])) return [];
    if (start[0] === goal[0] && start[1] === goal[1]) return [goal];
    const prev = new Map([[key(start[0], start[1]), null]]);
    const q = [start];
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length) {
      const [c, r] = q.shift();
      for (const [dc, dr] of D) {
        const nc = c + dc, nr = r + dr, k = key(nc, nr);
        if (!walkable(nc, nr) || prev.has(k)) continue;
        prev.set(k, [c, r]); q.push([nc, nr]);
        if (nc === goal[0] && nr === goal[1]) {
          const out = []; let cur = [nc, nr];
          while (cur) { out.unshift(cur); cur = prev.get(key(cur[0], cur[1])); }
          return out;
        }
      }
    }
    return [];
  }

  /* ---------- canvases ---------- */
  let wc, hc, w, h, f = 1, dx = 0, dy = 0, cssW = 0, cssH = 0;
  function init(worldCanvas, hudCanvas) {
    wc = worldCanvas; hc = hudCanvas; w = wc.getContext("2d"); h = hc.getContext("2d"); wc.width = LW; wc.height = LH; resize();
    if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(wc.parentElement);
  }
  function resize() {
    const r = wc.parentElement.getBoundingClientRect();
    if (r.width === cssW && r.height === cssH) return;
    cssW = r.width; cssH = r.height;
    const fit = Math.min(cssW / LW, cssH / LH);
    f = fit < 2 ? Math.max(0.9, fit) : Math.floor(fit * 2) / 2;
    dx = Math.round((cssW - LW * f) / 2); dy = Math.round((cssH - LH * f) / 2);
    Object.assign(wc.style, { inset: "auto", width: LW * f + "px", height: LH * f + "px", left: dx + "px", top: dy + "px" });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    hc.width = Math.round(cssW * dpr); hc.height = Math.round(cssH * dpr);
    h.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------- projection + primitives ---------- */
  const P = (c, r) => [OX + (c - r) * 8, OY + (c + r) * 4];
  const C = (c, r) => P(c + 0.5, r + 0.5);
  function poly(pts, fill, stroke) {
    w.beginPath(); pts.forEach((p, i) => (i ? w.lineTo(p[0], p[1]) : w.moveTo(p[0], p[1]))); w.closePath();
    if (fill) { w.fillStyle = fill; w.fill(); }
    if (stroke) { w.strokeStyle = stroke; w.lineWidth = 1; w.stroke(); }
  }
  const up = (p, H) => [p[0], p[1] - H];
  function diamond(c0, r0, c1, r1, H, fill, stroke) { poly([up(P(c0, r0), H), up(P(c1, r0), H), up(P(c1, r1), H), up(P(c0, r1), H)], fill, stroke); }
  function box(c0, r0, c1, r1, H, top, right, front) {
    poly([up(P(c1, r0), H), up(P(c1, r1), H), P(c1, r1), P(c1, r0)], right);
    poly([up(P(c0, r1), H), up(P(c1, r1), H), P(c1, r1), P(c0, r1)], front);
    diamond(c0, r0, c1, r1, H, top);
  }
  function wallR(c, r0, r1, H, face, top) {
    poly([up(P(c, r0), H), up(P(c, r1), H), P(c, r1), P(c, r0)], face);
    poly([up(P(c, r0), H), up(P(c, r1), H), up(P(c - 0.14, r1), H), up(P(c - 0.14, r0), H)], top);
  }
  function wallC(c0, c1, r, H, face, top) {
    poly([up(P(c0, r), H), up(P(c1, r), H), P(c1, r), P(c0, r)], face);
    poly([up(P(c0, r), H), up(P(c1, r), H), up(P(c1, r - 0.14), H), up(P(c0, r - 0.14), H)], top);
  }
  function line(a, b, col, alpha, width) { w.strokeStyle = col; w.globalAlpha = alpha == null ? 1 : alpha; w.lineWidth = width || 1; w.beginPath(); w.moveTo(a[0], a[1]); w.lineTo(b[0], b[1]); w.stroke(); w.globalAlpha = 1; }
  const px = (x, y, wd, ht, col) => { w.fillStyle = col; w.fillRect(Math.round(x), Math.round(y), wd, ht); };
  function glowRect(x, y, wd, ht, col, a) { w.globalAlpha = a; px(x, y, wd, ht, col); w.globalAlpha = 1; }
  function ring(x, y, rad, col, alpha) { w.beginPath(); w.arc(x, y, rad, 0, Math.PI * 2); w.strokeStyle = col; w.globalAlpha = alpha; w.lineWidth = 1; w.stroke(); w.globalAlpha = 1; }
  function digit(x, y, n, col) { const rows = DIG[n] || DIG[0]; rows.forEach((row, j) => { for (let i = 0; i < 3; i++) if (row[i] === "1") px(x + i, y + j, 1, 1, col); }); }
  function number(x, y, n, col, w2) { const s = String(Math.min(99, Math.max(0, n | 0))).padStart(w2 || 2, "0"); for (let i = 0; i < s.length; i++) digit(x + i * 4, y, +s[i], col); }
  function pool(c, r, rx, ry, col, a) { // soft light on the ground, iso ellipse
    const m = C(c, r); const g = w.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
    w.save(); w.translate(m[0], m[1]); w.scale(rx, ry); w.globalAlpha = a; w.fillStyle = g; w.beginPath(); w.arc(0, 0, 1, 0, Math.PI * 2); w.fill(); w.restore();
  }

  /* ---------- ground ---------- */
  function tileColor(c, r) {
    if (r < 0) return c >= -1 && c <= 25 ? K.concrete : null;
    if (r <= 2) { if (c >= 3 && c <= 20) return K.floor; return K.concrete; }
    if (r === 3) return K.asphalt;
    if (r === 4 || r === 5) return K.lane;
    if (r === 6) return c <= 20 ? K.asphalt : K.concrete;
    if (r === 7) return c >= 4 && c <= 18 ? K.asphalt : c >= 21 ? K.concrete : K.grass;
    if (r === 8 || r === 9) return c >= 21 && r === 8 ? K.concrete : K.track;
    if (r >= 10 && r <= 12) return K.grass;
    return null;
  }
  function ground(view, t) {
    for (let r = -2; r <= 12; r++) for (let c = -2; c < COLS + 2; c++) {
      const col = tileColor(c, r); if (!col) continue;
      diamond(c, r, c + 1, r + 1, 0, col);
      if (col === K.grass && (c * 7 + r * 3) % 5 === 0) diamond(c + 0.3, r + 0.3, c + 0.5, r + 0.5, 0, "#15201a");
    }
    // bay floors: lit centre + painted yellow pit-box outline
    [3, 9, 15].forEach((c0) => {
      diamond(c0 + 0.5, 0.4, c0 + 5.5, 2.7, 0, K.floorLit);
      diamond(c0 + 0.35, 0.3, c0 + 5.65, 2.8, 0, null, K.yellow);
    });
    // floodlight pools under the three masts and desk tints
    pool(2.5, 6.2, 44, 22, K.lamp, 0.13); pool(19.8, 6.2, 44, 22, K.lamp, 0.13); pool(22.7, 3.4, 34, 17, K.lamp, 0.12);
    pool(5.5, 1.6, 22, 11, K.yellow, 0.16); pool(11.5, 1.6, 22, 11, K.steel, 0.12); pool(17.5, 1.6, 22, 11, K.orange, 0.16);
    // faint tile grid on asphalt / lane
    w.globalAlpha = 0.07;
    for (let r = 3; r <= 6; r++) for (let c = 0; c < COLS; c++) if (tileColor(c, r)) diamond(c, r, c + 1, r + 1, 0, null, K.steel);
    w.globalAlpha = 1;
    // pit lane edge lines, speed-limit line, lane chevrons
    line(P(0, 4), P(24, 4), K.text, 0.55); line(P(0, 6), P(21, 6), K.text, 0.55); line(P(2, 4), P(2, 6), K.text, 0.8);
    for (let c = 5; c < 22; c += 4) { const m = C(c, 4.5); px(m[0] - 2, m[1], 2, 1, K.text); px(m[0], m[1] - 1, 2, 1, K.text); }
    // painted pit-box line where the bays meet the apron
    for (let c = 3; c < 21; c++) diamond(c, 2.86, c + 1, 3, 0, K.yellow);
    // cable bridge across the pit lane from bay 2 to the pit wall
    line(P(10.5, 3), P(10.5, 7), K.dark, 1, 2); w.setLineDash([2, 2]); line(P(10.5, 3), P(10.5, 7), K.yellow, 0.9); w.setLineDash([]);
    // kerb on the track's far edge and the track's centre markings
    for (let c = 0; c < 21; c++) diamond(c, 7.74, c + 1, 8, 0, c % 2 ? K.red : K.text);
    line(P(0, 9), P(21, 9), K.text, 0.18);
    // station glows
    const g = view.stationGlow || {};
    const glow = (c0, r0, c1, r1, col, a) => { if (a > 0.01) { w.globalAlpha = a * 0.35; diamond(c0, r0, c1, r1, 0, col); w.globalAlpha = 1; } };
    glow(3, 1, 9, 3, K.yellow, g.prospector || 0); glow(9, 1, 15, 3, K.steel, g.writer || 0); glow(15, 1, 21, 3, K.orange, g.strategist || 0);
    glow(0, 3, 3, 4, K.blue, g.radio || 0); glow(20, 3, 24, 4, K.blue, g.board || 0); glow(4, 6, 19, 7, K.green, g.pitwall || 0); glow(19, 5, 21, 7, K.red, g.tower || 0);
  }

  /* ---------- props ---------- */
  function cone(c, r) { const m = C(c, r); px(m[0] - 1, m[1] - 3, 3, 1, K.orange); px(m[0], m[1] - 5, 1, 2, K.orange); px(m[0], m[1] - 4, 1, 1, K.text); px(m[0] - 2, m[1] - 2, 5, 1, K.dark); }
  function crate(c, r, col) { box(c, r, c + 0.5, r + 0.5, 4, col, K.wallC, K.wallA); const m = up(P(c + 0.25, r + 0.5), 2); px(m[0] - 1, m[1], 2, 1, K.dark); }
  function tyres(c, r) { const m = C(c, r); for (let i = 0; i < 3; i++) { const y = m[1] - i * 3; px(m[0] - 4, y - 2, 8, 3, K.dark); px(m[0] - 3, y - 2, 6, 1, "#2e3238"); px(m[0] - 1, y - 1, 2, 1, i === 1 ? K.yellow : "#3a4048"); } }
  function toolChest(c, r) { box(c, r, c + 0.8, r + 0.55, 7, "#b9201a", "#8f1611", K.red); const m = up(P(c + 0.4, r + 0.55), 5); px(m[0] - 2, m[1], 4, 1, K.steel); px(m[0] - 2, m[1] + 2, 4, 1, K.steel); }
  function mast(items, c, r) {
    items.push({ d: c + r + 1, draw() {
      const m = C(c, r); px(m[0] - 1, m[1] - 1, 3, 2, K.wallC); px(m[0], m[1] - 34, 1, 34, K.steel);
      px(m[0] - 3, m[1] - 36, 7, 2, K.wallC); px(m[0] - 2, m[1] - 35, 5, 1, K.lamp);
      glowRect(m[0] - 4, m[1] - 37, 9, 4, K.lamp, 0.25);
    } });
  }
  function monitor(c, r, H, col, wide) { const m = up(P(c, r), H); const wd = wide ? 7 : 5; px(m[0] - (wd >> 1), m[1] - 5, wd, 4, K.dark); px(m[0] - (wd >> 1) + 1, m[1] - 4, wd - 2, 2, col); px(m[0], m[1] - 1, 1, 1, K.wallC); glowRect(m[0] - (wd >> 1) - 1, m[1] - 6, wd + 2, 6, col, 0.14); }

  /* ---------- buildings ---------- */
  function garage(items) {
    items.push({ d: -5, draw() {
      const H = 24;
      wallC(3, 21, 0, H, K.wallA, K.wallB);
      poly([up(P(3, 0), H), up(P(21, 0), H), up(P(21, -0.7), H + 3), up(P(3, -0.7), H + 3)], K.wallC); // roof ledge
      poly([up(P(3, -0.7), H + 3), up(P(21, -0.7), H + 3), up(P(21, -0.7), H + 1), up(P(3, -0.7), H + 1)], K.wallD);
      // livery stripe along the back wall
      const s = (c0, c1, col) => poly([up(P(c0, 0), 7), up(P(c1, 0), 7), up(P(c1, 0), 5), up(P(c0, 0), 5)], col);
      s(3, 9, K.red); s(9, 15, K.orange); s(15, 20.3, K.yellow); s(20.3, 21, K.green);
      [3, 9, 15].forEach((c0, i) => {
        // strip light + bay number on the back wall
        const a = up(P(c0 + 0.7, 0), H - 4), b = up(P(c0 + 5.3, 0), H - 4);
        line(a, b, K.lamp, 1, 1); line(a, b, K.lamp, 0.25, 3);
        const n = up(P(c0 + 3, 0), H - 10); digit(n[0] - 1, n[1], i + 1, K.steel);
        // a pin board of timing sheets
        const q = up(P(c0 + 1.2, 0), H - 9); px(q[0], q[1], 4, 3, K.white); px(q[0] + 1, q[1] + 1, 2, 1, K.muted);
      });
    } });
    [3, 9, 15, 21].forEach((c) => { for (let r = 0; r < 3; r++) items.push({ d: c + r + 0.5, draw() { wallR(c, r, r + 1, 18, K.wallA, K.yellow); if (r === 1) { const m = up(P(c, r + 0.5), 12); px(m[0] + 1, m[1], 1, 3, K.lamp); } } }); });
    const desks = [[5, 1, K.yellow], [11, 1, K.steel], [17, 1, K.orange]];
    desks.forEach(([c, r, col], i) => {
      items.push({ d: c + r + 0.6, draw() {
        box(c + 0.05, r - 0.05, c + 1, r + 0.55, 6, K.wallB, K.wallC, K.wallA);
        monitor(c + 0.35, r + 0.18, 6, col); monitor(c + 0.75, r + 0.18, 6, i === 1 ? K.blue : col);
        const k = up(P(c + 0.5, r + 0.45), 6); px(k[0] - 2, k[1], 4, 1, K.dark);
      } });
      const c0 = [3, 9, 15][i];
      items.push({ d: c0 + 0.7, draw() { toolChest(c0 + 0.25, 0.15); } });
      items.push({ d: c0 + 5.4, draw() { tyres(c0 + 5.1, 0.35); } });
      items.push({ d: c0 + 2.8, draw() { crate(c0 + 2.2, 0.1, K.wallB); } });
    });
  }
  function truck(items) {
    items.push({ d: 4.9, draw() {
      const H = 18;
      box(0, 0, 3, 2, H, K.white, "#cfd4d9", "#b9bfc6");
      // stripe along the +c side of the box, four livery segments
      const seg = (r0, r1, col) => poly([up(P(3, r0), 9), up(P(3, r1), 9), up(P(3, r1), 6), up(P(3, r0), 6)], col);
      seg(0.1, 0.75, K.red); seg(0.75, 1.3, K.orange); seg(1.3, 1.75, K.yellow); seg(1.75, 1.9, K.green);
      const lg = up(P(3, 1), 14); px(lg[0] - 7, lg[1] - 2, 6, 3, K.dark); px(lg[0] - 6, lg[1] - 1, 4, 1, K.steel); // team logo plate
      box(0, 2, 3, 3, 9, "#d6dadf", "#aeb4bb", K.white); // cab
      const win = up(P(1.05, 3), 8); px(win[0], win[1], 8, 3, K.glass); px(win[0] + 1, win[1] + 1, 2, 1, K.glassLit);
      const hl = up(P(2.4, 3), 2); px(hl[0], hl[1], 2, 1, K.yellow); px(hl[0] - 8, hl[1], 2, 1, K.yellow);
      [[0.6, 3], [2.4, 3]].forEach(([c, r]) => { const q = P(c, r); px(q[0] - 2, q[1] - 2, 4, 3, K.dark); });
      // mast and dish on the roof
      const m = up(P(1.5, 0.8), H); px(m[0], m[1] - 12, 1, 12, K.steel); px(m[0] - 1, m[1] - 13, 3, 1, K.red);
      const d = up(P(2.3, 1.4), H); w.fillStyle = K.steel; w.beginPath(); w.ellipse(d[0], d[1] - 3, 4, 2, -0.4, 0, Math.PI * 2); w.fill(); px(d[0], d[1] - 5, 1, 3, K.muted);
      glowRect(m[0] - 1, m[1] - 14, 3, 2, K.red, 0.5);
    } });
  }
  function board(items, view) {
    items.push({ d: 24, draw() {
      box(21, 0, 24, 0.5, 20, K.wallC, K.wallD, K.wallA);
      const a = up(P(21.1, 0.5), 19), b = up(P(23.9, 0.5), 19);
      poly([[a[0] - 1, a[1] - 1], [b[0] + 1, b[1] - 1], [b[0] + 1, b[1] + 15], [a[0] - 1, a[1] + 15]], K.blue);
      poly([a, b, [b[0], b[1] + 14], [a[0], a[1] + 14]], K.dark);
      const rows = [[view.board.replies, K.blue], [view.board.meetings, K.green], [view.board.closes, K.yellow]];
      rows.forEach(([n, col], i) => { const x = a[0] + 2, y = a[1] + 1 + i * 4.5; px(x, y + 2, 2, 1, col); number(x + 4, y, n, col); glowRect(x + 3, y - 1, 9, 6, col, 0.12); });
      const post = P(22.5, 0.5); px(post[0] - 1, post[1] - 1, 2, 2, K.wallC);
    } });
  }
  function pitwall(items, view, t) {
    for (let c = 4; c < 19; c++) items.push({ d: c + 8.6, draw() {
      box(c, 7, c + 1, 8, 6, K.wallB, K.wallC, K.wallA);
      if (c === 4 || c === 18) { const e = up(P(c + 0.5, 7.5), 6); px(e[0] - 1, e[1] - 10, 1, 10, K.steel); px(e[0] - 2, e[1] - 11, 3, 1, K.wallC); }
      // headset cable along the wall top
      if (c > 4 && c < 18) { const a = up(P(c, 7.3), 6), b = up(P(c + 1, 7.3), 6); line(a, b, K.dark, 0.8); }
    } });
    // monitors: two per seat, a wide timing screen between
    [[7.35, K.blue], [8.65, K.blue], [11.35, K.green], [12.65, K.green]].forEach(([c, col]) => items.push({ d: c + 8.9, draw() { monitor(c, 7.4, 6, col); } }));
    items.push({ d: 18.9, draw() { monitor(10, 7.4, 6, K.yellow, true); const m = up(P(10, 7.4), 6); px(m[0] - 2, m[1] - 4, 1, 1, K.dark); px(m[0], m[1] - 4, 1, 1, K.dark); } });
    // seats
    [8, 12].forEach((c) => items.push({ d: c + 8.3, draw() { const s = up(P(c + 0.5, 7.7), 6); px(s[0] - 3, s[1] - 2, 6, 2, K.wallD); px(s[0] - 3, s[1] - 6, 1, 4, K.wallD); } }));
  }
  function tower(items, view, t) {
    items.push({ d: 33, draw() {
      const H = 44;
      box(21, 6, 24, 9, H, K.wallB, K.wallA, K.wallC);
      // livery band around both visible faces
      const band = (pts, col) => poly(pts, col);
      const bR = (r0, r1, col) => band([up(P(24, r0), 18), up(P(24, r1), 18), up(P(24, r1), 15), up(P(24, r0), 15)], col);
      bR(6, 7, K.red); bR(7, 7.7, K.orange); bR(7.7, 8.5, K.yellow); bR(8.5, 9, K.green);
      const bF = (c0, c1, col) => band([up(P(c0, 9), 18), up(P(c1, 9), 18), up(P(c1, 9), 15), up(P(c0, 9), 15)], col);
      bF(21, 21.5, K.green); bF(21.5, 22.3, K.yellow); bF(22.3, 23, K.orange); bF(23, 24, K.red);
      // lit windows band on both faces, guardian in the +c window
      const wa = up(P(24, 6.3), H - 6), wb = up(P(24, 8.7), H - 6);
      poly([wa, wb, [wb[0], wb[1] + 9], [wa[0], wa[1] + 9]], K.glass);
      for (let i = 0; i < 4; i++) { const q = up(P(24, 6.5 + i * 0.6), H - 7); px(q[0] - 1, q[1], 3, 1, K.glassLit); }
      const g = up(P(24, 7.5), H - 9); px(g[0] - 2, g[1], 3, 3, K.steel); px(g[0] - 3, g[1] + 3, 5, 4, K.text);
      const fa = up(P(21.3, 9), H - 6), fb = up(P(23.7, 9), H - 6);
      poly([fa, fb, [fb[0], fb[1] + 7], [fa[0], fa[1] + 7]], K.glass);
      [21.6, 22.5, 23.4].forEach((c) => { const q = up(P(c, 9), H - 8); px(q[0] - 2, q[1], 4, 2, K.glassLit); });
      // light panel on the +r face: five large lights with a dark housing
      const st = view.tower.status, blink = Math.floor(t * 4) % 2 === 0;
      const pa = up(P(21.2, 9), H - 21), pb = up(P(23.8, 9), H - 21);
      poly([[pa[0], pa[1] - 2], [pb[0], pb[1] - 2], [pb[0], pb[1] + 7], [pa[0], pa[1] + 7]], K.dark);
      for (let i = 0; i < 5; i++) {
        const p = up(P(21.5 + i * 0.5, 9), H - 21);
        const col = st === "red" ? K.red : st === "checking" && blink ? K.yellow : "#2e333a";
        px(p[0] - 1, p[1], 3, 3, col);
        if (col !== "#2e333a") glowRect(p[0] - 2, p[1] - 1, 5, 5, col, 0.35);
      }
      // roof: antenna + flag pole
      const top = up(P(22.5, 7.5), H); px(top[0], top[1] - 16, 1, 16, K.steel); px(top[0] - 1, top[1] - 17, 3, 1, K.steel);
      const an = up(P(21.7, 6.6), H); px(an[0], an[1] - 7, 1, 7, K.muted); px(an[0] - 1, an[1] - 8, 3, 1, K.red);
      const flag = view.halted ? K.red : view.lightsOut > 0 ? K.green : null;
      if (flag) { const wave = reduced ? 0 : Math.round(Math.sin(t * 8)); px(top[0] + 1, top[1] - 15 + wave, 7, 5, flag); glowRect(top[0], top[1] - 16 + wave, 9, 7, flag, 0.25); }
    } });
  }
  function armco(items) {
    items.push({ d: 32, draw() { for (let c = 0; c < 21; c++) { const a = P(c, 10), b = P(c + 1, 10); line([a[0], a[1] - 3], [b[0], b[1] - 3], K.steel, 0.9); line(a, b, K.wallC, 1); px(a[0], a[1] - 4, 1, 4, K.muted); } } });
  }
  function car(items, view) {
    if (view.carT < 0 || view.carT == null) return;
    const c = -1 + view.carT * 23;
    items.push({ d: c + 9 + 1, draw() {
      const m = C(c, 8.4);
      px(m[0] - 6, m[1] - 1, 12, 3, K.dark);
      px(m[0] - 5, m[1] - 3, 10, 3, K.steel); px(m[0] - 2, m[1] - 4, 4, 1, K.steel);
      px(m[0] - 4, m[1] - 2, 2, 1, K.red); px(m[0] - 2, m[1] - 2, 2, 1, K.orange); px(m[0], m[1] - 2, 2, 1, K.yellow);
      px(m[0] - 5, m[1], 2, 2, K.dark); px(m[0] + 3, m[1], 2, 2, K.dark); px(m[0] + 5, m[1] - 2, 1, 1, K.red);
    } });
  }
  function apronProps(items) {
    [[0.4, 3.6], [23.4, 3.3], [19.6, 3.75], [0.9, 5.7]].forEach(([c, r]) => items.push({ d: c + r + 1, draw() { cone(c, r); } }));
    items.push({ d: 24.5, draw() { crate(20.1, 3.05, K.wallA); crate(20.55, 3.05, K.wallB); } });
    items.push({ d: 3.6, draw() { crate(0.1, 3.1, K.wallA); } });
    items.push({ d: 22.5, draw() { tyres(21.6, 3.3); } });
  }

  /* ---------- crew ---------- */
  function crew(items, m, t) {
    const d = m.c + m.r + 1;
    items.push({ d, draw() {
      const [x, y0] = C(m.c, m.r);
      const bob = !m.walking && !m.seated && !reduced ? (Math.floor(t * 2 + d) % 2) : 0;
      const y = y0 - bob - (m.seated ? 5 : 0);
      const fx = m.facing < 0 ? -1 : 1;
      if (!m.seated) { w.globalAlpha = 0.4; px(x - 3, y0, 6, 1, K.dark); w.globalAlpha = 1; }
      const f1 = m.walking && m.frame % 2 === 1;
      // outline silhouette first
      px(x - 3, y - 12, 6, 5, K.outline); px(x - 4, y - 9, 8, 7, K.outline);
      if (!m.seated) { px(x - 3, y - 4, 3, 5 - (f1 ? 1 : 0), K.outline); px(x, y - 4, 3, 5 - (f1 ? 0 : 1), K.outline); }
      // legs, suit, stripe, armband, helmet
      if (!m.seated) { px(x - 2, y - 3 - (f1 ? 1 : 0), 2, 3, K.text); px(x + 1, y - 3, 2, 3 - (f1 ? 1 : 0), K.text); }
      px(x - 3, y - 8, 6, 5, K.text);
      px(x - 3, y - 7, 1, 2, K.red); px(x - 2, y - 7, 2, 2, K.orange); px(x, y - 7, 2, 2, K.yellow); px(x + 2, y - 7, 1, 2, K.green);
      px(fx > 0 ? x + 2 : x - 3, y - 8, 1, 1, m.color || K.steel);
      px(x - 2, y - 11, 4, 3, K.steel); px(fx > 0 ? x : x - 2, y - 10, 2, 1, K.dark);
      if (m.carrying) {
        const col = { leads: K.yellow, draft: K.steel, approved: K.green, proposal: K.orange, reply: K.blue }[m.carrying] || K.steel;
        const cx = fx > 0 ? x + 4 : x - 7; px(cx - 1, y - 8, 5, 4, K.outline); px(cx, y - 7, 3, 2, col); if (m.carrying === "leads") px(cx, y - 9, 3, 1, col);
      }
      if (m.bubble) bubble(x, y - 14, m.bubble, t);
    } });
  }
  function bubble(x, y, kind, t) {
    if (kind === "wait") { const n = Math.floor(t * 3) % 3; for (let i = 0; i < 3; i++) px(x - 3 + i * 3, y - 2, 1, 1, i <= n ? K.steel : "#3a4048"); }
    else if (kind === "ok") { px(x - 2, y - 2, 1, 1, K.green); px(x - 1, y - 1, 1, 1, K.green); px(x, y - 2, 1, 1, K.green); px(x + 1, y - 3, 1, 1, K.green); px(x + 2, y - 4, 1, 1, K.green); }
    else if (kind === "halt") { for (let i = -2; i <= 2; i++) { px(x + i, y - 3 + i, 1, 1, K.red); px(x + i, y - 3 - i, 1, 1, K.red); } }
    else if (kind === "read") { px(x - 3, y - 4, 7, 4, K.dark); px(x - 2, y - 3, 5, 2, K.blue); }
    else if (kind === "radio") { const r = 2 + (t * 6) % 3; ring(x, y - 2, r, K.blue, 0.8 - ((t * 6) % 3) * 0.25); px(x, y - 2, 1, 1, K.blue); }
  }

  /* ---------- pings ---------- */
  function pings(view) {
    const mc = C(8, 7);
    for (const p of view.pings || []) {
      const q = C(p.c, p.r);
      if (p.kind === "dispatch") {
        w.setLineDash([2, 3]); line([mc[0], mc[1] - 8], q, K.steel, 0.6 * (1 - p.t)); w.setLineDash([]);
        const x = mc[0] + (q[0] - mc[0]) * p.t, y = mc[1] - 8 + (q[1] - mc[1] + 8) * p.t; px(x - 1, y - 1, 2, 2, K.steel);
      } else if (p.kind === "send" || p.kind === "recv") {
        const m = up(P(1.5, 0.8), 30); ring(m[0], m[1], 2 + p.t * 12, p.kind === "send" ? K.orange : K.blue, 1 - p.t);
      } else if (p.kind === "check") { ring(q[0], q[1] - 6, 2 + p.t * 10, K.yellow, 1 - p.t); }
      else if (p.kind === "cross") { ring(q[0], q[1] - 6, 2 + p.t * 10, K.red, 1 - p.t); }
    }
  }

  /* ---------- HUD labels ---------- */
  function H(x, y) { return [dx + x * f, dy + y * f]; }
  function label(c, r, lift, name, sub, col, align, gap) {
    const [ax, ay] = H(...up(P(c, r), lift)); // anchor: the building's top edge
    const g = gap == null ? 14 : gap, y = ay - g;
    h.strokeStyle = col; h.globalAlpha = 0.55; h.lineWidth = 1; h.beginPath(); h.moveTo(ax + 0.5, ay); h.lineTo(ax + 0.5, y + 3); h.stroke(); h.globalAlpha = 1;
    h.textAlign = align || "center"; h.textBaseline = "bottom";
    h.font = `${Math.max(8, Math.round(4.2 * f))}px Michroma, "Arial Black", sans-serif`; h.fillStyle = col;
    const x = align === "left" ? ax + 4 : align === "right" ? ax - 4 : ax;
    h.fillText(name, x, y);
    if (sub && cssW >= 520) { h.font = `${Math.max(8, Math.round(3.6 * f))}px "Chivo Mono", Menlo, monospace`; h.fillStyle = K.muted; h.textBaseline = "top"; h.fillText(sub, x, y + 1); }
  }
  function hud(view) {
    h.clearRect(0, 0, cssW, cssH);
    label(6, -0.7, 27, "TIMING & SCORING", "bay 1 · prospector", K.yellow);
    label(12, -0.7, 27, "COMMERCIAL DESK", "bay 2 · outreach writer", K.steel);
    label(18, -0.7, 27, "STRATEGY WALL", "bay 3 · strategist", K.orange);
    label(0, 1, 18, "TEAM RADIO", "sender · inbox", K.blue, "right", 0);
    label(22.5, 0, 20, "RESULTS", `${view.board.replies} replies · ${view.board.meetings} mtg · ${view.board.closes} won`, K.blue, "center", 14);
    label(11.5, 8, 6, "PIT WALL", "mission control · eris", K.green, "center", -30);
    label(24, 9, 0, "RACE CONTROL", view.halted ? "RED FLAG" : view.tower.status === "checking" ? "checking" : "guardian · clear", view.halted ? K.red : K.steel, "center", -18);
    const banner = view.halted ? ["RED FLAG · OUTBOUND HALTED", K.red, 1] : view.lightsOut > 0 ? ["GREEN FLAG", K.green, Math.min(1, view.lightsOut * 2)] : null;
    if (banner) {
      h.textAlign = "center"; h.textBaseline = "top"; h.globalAlpha = banner[2];
      h.font = `${Math.max(11, Math.round(5.2 * f))}px Michroma, "Arial Black", sans-serif`; h.fillStyle = banner[1];
      h.fillText(banner[0], cssW / 2, 14); h.globalAlpha = 1;
    }
  }

  /* ---------- frame ---------- */
  function render(view, tNow) {
    const t = (tNow || performance.now()) / 1000;
    view = Object.assign({ halted: false, lightsOut: 0, lap: 1, carT: -1, crew: [], pings: [], stationGlow: {}, tower: { status: "ok" }, board: { replies: 0, meetings: 0, closes: 0 } }, view || {});
    w.imageSmoothingEnabled = false;
    w.fillStyle = "#07080a"; w.fillRect(0, 0, LW, LH);
    ground(view, t);
    const items = [];
    garage(items); truck(items); board(items, view); pitwall(items, view, t); tower(items, view, t); armco(items); car(items, view); apronProps(items);
    mast(items, 2.5, 7.3); mast(items, 19.8, 7.3); mast(items, 22.7, 4.7);
    for (const m of view.crew) crew(items, m, t);
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.draw();
    pings(view);
    hud(view);
  }

  window.Paddock = { GRID: { cols: COLS, rows: ROWS }, walkable, STATIONS, findPath, init, resize, render, LW, LH };
})();
