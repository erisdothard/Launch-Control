// Launch Control CRM sales demo. Script: demo-video/SCRIPT.md. All CRM coordinates are in the
// captured 1440x900 screen space (R = rects measured on the real CRM at capture time).
window.__timelines = window.__timelines || {};
const R = __RECTS__;
const tl = gsap.timeline({ paused: true });

const W = 1300;
const H = 813;
const K = W / 1440; // base fit of the 1440x900 CRM into the window
const SCROLL = { lead_new: 400, deals_before: 100, deals_after: 100, calendar_call: 200 };
const LIST = [671, 446]; // Today list framing: left edge on the main column, right edge in the gutter

// ---------- helpers ----------
const c = (state, id, scrolled) => {
  const r = R[state][id];
  const dy = r.x > 240 ? scrolled ?? SCROLL[state] ?? 0 : 0; // the sidebar never scrolls
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 - dy, r: { ...r, y: r.y - dy } };
};
let zoomNow = 1;
function cam(z, px, py, at, dur = 0.9, ease = "power3.inOut") {
  const s = K * z;
  const x = Math.min(0, Math.max(W - s * 1440, W / 2 - s * px));
  let left = -x / s;
  if (left > 0 && left < 256) left = 256; // land on the main column, never mid-sidebar
  const xs = Math.min(0, Math.max(W - s * 1440, -left * s));
  const y = Math.min(0, Math.max(H - s * 900, H / 2 - s * py));
  tl.to("#view", { scale: s, x: xs, y, duration: dur, ease }, at);
  tl.to("#cursor", { scale: 1 / z, duration: dur, ease }, at);
  zoomNow = z;
}
const camOn = (state, id, z, at, dur) => { const p = c(state, id); cam(z, p.x, p.y, at, dur); };
const wide = (at) => cam(1, 0, 0, at, 0.6);
function screenIn(state, at, dur = 0.4) {
  tl.fromTo("#s-" + state, { opacity: 0 }, { opacity: 1, duration: dur, ease: "power1.out" }, at);
}
function screenOut(state, at, dur = 0.3) {
  tl.to("#s-" + state, { opacity: 0, duration: dur, ease: "power1.in" }, at);
}
function scroll(state, at, dur = 0) {
  const sel = `#s-${state} div.overflow-y-auto > div.flex-1`;
  if (dur) tl.to(sel, { y: -SCROLL[state], duration: dur, ease: "power2.inOut" }, at);
  else tl.set(sel, { y: -SCROLL[state] }, at);
}
function cursorShow(x, y, at) { tl.set("#cursor", { x, y }, at); tl.to("#cursor", { opacity: 1, duration: 0.2 }, at); }
function cursorHide(at) { tl.to("#cursor", { opacity: 0, duration: 0.25 }, at); }
function cursorTo(x, y, at, dur = 0.55) { tl.to("#cursor", { x, y, duration: dur, ease: "power2.inOut" }, at); }
function click(x, y, at) {
  tl.to("#cursor", { scale: 0.82 / zoomNow, duration: 0.08, yoyo: true, repeat: 1 }, at);
  tl.set("#ripple", { x, y, scale: 0.4 / zoomNow, opacity: 1 }, at);
  tl.to("#ripple", { scale: 1.7 / zoomNow, opacity: 0, duration: 0.45, ease: "power2.out" }, at);
}
let spotN = 0;
function spot(rect, label, from, to, opt = {}) {
  const pad = opt.pad ?? 8;
  const id = "spot" + spotN++;
  const el = document.createElement("div");
  el.className = "spot" + (opt.soft ? " soft" : "");
  el.id = id;
  Object.assign(el.style, { left: rect.x - pad + "px", top: rect.y - pad + "px", width: rect.w + pad * 2 + "px", height: rect.h + pad * 2 + "px" });
  el.innerHTML = `<div class="lbl${opt.below ? " below" : ""}${opt.inside ? " inside" : ""}${opt.foot ? " foot" : ""}">${label}</div>`;
  document.getElementById("view").insertBefore(el, document.getElementById("typed"));
  tl.fromTo("#" + id, { opacity: 0, scale: 1.03 }, { opacity: 1, scale: 1, duration: 0.35, ease: "power2.out" }, from);
  tl.to("#" + id, { opacity: 0, duration: 0.3 }, to);
}
function caption(n, from, to) {
  tl.fromTo(`#cap${n}`, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }, from);
  tl.to(`#cap${n}`, { opacity: 0, duration: 0.3 }, to);
}
function tick(n, i, at) {
  tl.fromTo(`#cap${n} .tick:nth-child(${i})`, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.35, ease: "back.out(2)" }, at);
}
function rail(i, at) {
  tl.to(`#st${i} .lit`, { opacity: 1, duration: 0.3 }, at);
  tl.to(`#st${i} .dot`, { scale: 1, duration: 0.35, ease: "back.out(3)" }, at);
  tl.to(`#st${i} span.on`, { opacity: 1, duration: 0.3 }, at);
  if (i > 0) tl.to(`#sg${i} i`, { scaleX: 1, duration: 0.45, ease: "power2.out" }, at - 0.3);
}

// ---------- initial state ----------
tl.set("#view", { scale: K, x: 0, y: 0 }, 0);
tl.set("#cursor", { scale: 1 }, 0);
tl.set(["#win", "#rail"], { opacity: 0 }, 0);
tl.set("#s-today_new [data-hf=row0]", { opacity: 0 }, 0);

// ---------- 0: hook ----------
tl.from("#hook .stripe", { scaleX: 0, transformOrigin: "0 50%", duration: 0.7, ease: "expo.out" }, 0);
["#h1", "#h2", "#h3", "#h4"].forEach((h, i) => tl.fromTo(h, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, 0.2 + i * 0.65));
tl.to(["#h1", "#h2", "#h3"], { opacity: 0.25, duration: 0.35 }, 2.9);
tl.to("#hook", { opacity: 0, duration: 0.45 }, 3.6);

// ---------- 1: brand ----------
tl.to("#brand", { opacity: 1, duration: 0.4 }, 3.6);
tl.fromTo("#brand-logo", { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.7, ease: "power3.out" }, 3.75);
tl.fromTo("#brand-line", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out" }, 4.2);
tl.from("#brand-bar", { scaleX: 0, duration: 0.6, ease: "expo.out" }, 4.5);
tl.to("#brand", { opacity: 0, duration: 0.45 }, 5.9);

// ---------- 2: the inquiry lands (website first, then the CRM) ----------
tl.fromTo("#win", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 6.0);
tl.fromTo("#rail", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 6.2);
tl.set("#site", { opacity: 1 }, 6.0);
screenIn("today_before", 6.0, 0.01);
caption(2, 6.3, 13.8);
cam(1.5, 1040, 420, 6.3, 0.8);
["#fv-name", "#fv-email"].forEach((f, i) => tl.to(f, { opacity: 1, duration: 0.25 }, 6.9 + i * 0.3));
{
  const msg = "Saw you run arrive-and-drive race weekends. Two seasons of Spec Miata, ready to try open wheel. What would a weekend in the F2000 look like?";
  const o = { n: 0 };
  tl.set("#fv-msg", { opacity: 1 }, 7.5);
  tl.to(o, { n: msg.length, duration: 1.0, ease: "none", onUpdate: () => { document.getElementById("fv-msg").textContent = msg.slice(0, Math.round(o.n)); } }, 7.5);
}
cursorShow(1060, 760, 8.1);
cursorTo(856, 639, 8.25, 0.45);
click(856, 639, 8.75);
tl.to("#fsend", { scale: 0.95, duration: 0.08, yoyo: true, repeat: 1 }, 8.75);
cursorHide(8.9);
wide(8.95);
tl.to("#site", { opacity: 0, duration: 0.45, ease: "power2.in" }, 9.0);
tl.to("#u1", { opacity: 0, duration: 0.3 }, 9.1);
tl.to("#u2", { opacity: 1, duration: 0.3 }, 9.25);
screenOut("today_before", 9.85, 0.25);
screenIn("today_new", 9.85, 0.25);
tl.fromTo("#s-today_new [data-hf=row0]", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.5, ease: "back.out(1.5)" }, 10.0);
rail(0, 10.1);
tick(2, 1, 10.15);
cam(1.73, LIST[0], LIST[1], 10.4, 0.8);
spot(c("today_new", "row0").r, "New inquiry · start here", 11.3, 13.6, { below: true });
tick(2, 2, 11.0);
tick(2, 3, 11.8);

// ---------- 3: reply once, follow-up set ----------
wide(13.7);
screenOut("today_new", 13.9);
screenIn("lead_new", 14.0);
caption(3, 14.1, 23.1);
rail(1, 14.4);
scroll("lead_new", 14.4, 0.8);
cam(1.8, 1040, 573, 14.8, 0.9);
{
  const ta = c("lead_new", "textarea").r;
  tl.set("#typed", { left: ta.x, top: ta.y, width: ta.w, height: ta.h }, 15.6);
  tl.to("#typed", { opacity: 1, duration: 0.1 }, 15.65);
  const text = "Hi Jake, thanks for reaching out.\n\nOur F2000 race weekends are built for exactly that jump: car, coach and crew handled, so you just drive. Your Spec Miata seasons are a great base.\n\nWant me to send the details?";
  const o = { n: 0 };
  tl.to(o, { n: text.length, duration: 2.2, ease: "none", onUpdate: () => { const k = Math.round(o.n); document.getElementById("typed").textContent = text.slice(0, k) + (k < text.length ? "▍" : ""); } }, 15.7);
  const send = c("lead_new", "send");
  cursorShow(send.x + 160, send.y + 40, 17.6);
  cursorTo(send.x, send.y, 17.8, 0.5);
  click(send.x, send.y, 18.45);
}
tick(3, 1, 18.6);
tl.to("#typed", { opacity: 0, duration: 0.2 }, 18.75);
cursorHide(18.75);
screenOut("lead_new", 18.75);
screenIn("lead_sent", 18.85);
camOn("lead_sent", "hero", 1.22, 18.95, 0.9);
tick(3, 2, 19.4);
spot(c("lead_sent", "next").r, "Follow-up already scheduled", 20.0, 22.8, { inside: true });
rail(2, 20.1);
tick(3, 3, 20.3);

// ---------- 4: he writes back, the answer is drafted ----------
wide(22.9);
screenOut("lead_sent", 23.2);
screenIn("today_reply_closed", 23.3);
caption(4, 23.4, 31.2);
cam(1.73, LIST[0], LIST[1], 23.8, 0.8);
{
  const ch = c("today_reply_closed", "chev0");
  cursorShow(ch.x - 220, ch.y + 150, 24.4);
  cursorTo(ch.x, ch.y, 24.55, 0.55);
  click(ch.x, ch.y, 25.2);
}
tick(4, 1, 24.9);
tl.to("#s-today_reply_closed", { opacity: 0, duration: 0.2 }, 25.35);
tl.fromTo("#s-today_reply_open", { opacity: 0 }, { opacity: 1, duration: 0.25 }, 25.35);
cursorHide(25.5);
spot(c("today_reply_open", "draft").r, "Drafted for you · you send it", 26.0, 28.4);
tick(4, 2, 26.1);
{
  const b = c("today_reply_open", "primary");
  cursorShow(b.x + 240, b.y + 70, 28.3);
  cursorTo(b.x, b.y, 28.45, 0.55);
  click(b.x, b.y, 29.15);
  tl.to("#s-today_reply_open [data-hf=primary]", { scale: 0.96, duration: 0.08, yoyo: true, repeat: 1 }, 29.15);
  tl.set("#toast", { left: b.r.x + b.r.w + 330, top: b.r.y - 2 }, 29.2);
}
tl.fromTo("#toast", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.3, ease: "back.out(2)" }, 29.35);
tick(4, 3, 29.45);
cursorHide(29.6);
tl.to("#toast", { opacity: 0, duration: 0.3 }, 30.9);

// ---------- 5: the call is booked, his status moves, the deal is created ----------
wide(31.2);
screenOut("today_reply_open", 31.4);
scroll("calendar_call", 31.4);
screenIn("calendar_call", 31.5);
caption(5, 31.6, 40.3);
rail(3, 32.0);
cam(1.22, 1440, 446, 32.1, 0.9);
spot(c("calendar_call", "callitem").r, "Booked · Thu, Oct 29 · 1:00", 33.1, 35.0, { below: true });
spot(c("calendar_call", "day29").r, "Thursday", 33.1, 35.0, { pad: 3, soft: true });
tick(5, 1, 33.2);
tick(5, 2, 33.9);
wide(35.0);
screenOut("calendar_call", 35.2);
screenIn("lead_meeting", 35.3);
camOn("lead_meeting", "hero", 1.22, 35.5, 0.8);
spot(c("lead_meeting", "pill").r, "Status moved on its own", 36.4, 37.9, { pad: 6 });
tick(5, 3, 36.5);
tl.to("#s-lead_meeting div.overflow-y-auto > div.flex-1", { y: -330, duration: 0.7, ease: "power2.inOut" }, 38.0);
{
  const d = c("lead_meeting", "createdeal", 330);
  spot(d.r, "Create deal · $8,500", 38.8, 40.3);
  cursorShow(d.x + 260, d.y + 90, 38.9);
  cursorTo(d.x, d.y, 39.05, 0.55);
  click(d.x, d.y, 39.7);
  rail(4, 39.8);
}
cursorHide(40.0);

// ---------- 6: drag to Won ----------
wide(40.3);
screenOut("lead_meeting", 40.5);
scroll("deals_before", 40.5);
scroll("deals_after", 40.5);
screenIn("deals_before", 40.6);
caption(6, 40.7, 48.2);
cam(1.22, 846, 510, 41.0, 0.9);
{
  const a = c("deals_before", "jakecard");
  const b = c("deals_after", "jakecard");
  const grab = { x: a.r.x + 70, y: a.r.y + 40 };
  tl.set("#floater", { left: a.r.x, top: a.r.y, x: 0, y: 0, rotation: 0 }, 0);
  cursorShow(grab.x + 200, grab.y + 120, 41.7);
  cursorTo(grab.x, grab.y, 41.85, 0.6);
  tl.to("#cursor", { scale: 0.85 / 1.22, duration: 0.1 }, 42.5);
  tl.set("#floater", { opacity: 1 }, 42.55);
  tl.set("#s-deals_before [data-hf=jakecard]", { opacity: 0 }, 42.55);
  tl.to("#floater", { x: b.r.x - a.r.x, y: b.r.y - a.r.y, rotation: 2, duration: 1.4, ease: "power2.inOut" }, 42.6);
  cursorTo(grab.x + (b.r.x - a.r.x), grab.y + (b.r.y - a.r.y), 42.6, 1.4);
  tl.to("#floater", { rotation: 0, duration: 0.15 }, 44.0);
  tl.to("#cursor", { scale: 1 / 1.22, duration: 0.1 }, 44.0);
  tl.to("#s-deals_before", { opacity: 0, duration: 0.3 }, 44.05);
  tl.fromTo("#s-deals_after", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 44.05);
  tl.to("#floater", { opacity: 0, duration: 0.2 }, 44.4);
}
rail(5, 44.2);
tick(6, 1, 44.2);
cursorHide(44.5);
cam(1.62, 1296, 420, 44.6, 0.8);
spot(c("deals_after", "colwon").r, "Won · now a customer", 45.5, 48.0, { foot: true });
tick(6, 2, 45.6);
tick(6, 3, 46.4);

// ---------- 7: a normal morning ----------
wide(48.1);
screenOut("deals_after", 48.3);
screenIn("today_morning", 48.4);
caption(7, 48.5, 55.2);
["row0", "row1", "row2", "row3"].forEach((r, i) => tl.from(`#s-today_morning [data-hf=${r}]`, { opacity: 0, x: -24, duration: 0.4, ease: "power2.out" }, 48.7 + i * 0.25));
tick(7, 1, 49.0);
tick(7, 2, 49.6);
tick(7, 3, 50.2);
cam(1.73, LIST[0], LIST[1], 49.6, 1.0);
spot(c("today_morning", "row0").r, "Start here · reply drafted", 50.7, 52.3, { soft: true, below: true });
cam(1.25, 1440, 900, 52.3, 0.9);
spot(c("today_morning", "pipeline").r, "Your pipeline, live", 53.3, 55.1, { soft: true, below: true, pad: 12 });

// ---------- 8: close ----------
tl.to("#close", { opacity: 1, duration: 0.6 }, 55.2);
tl.fromTo("#close-logo", { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.8, ease: "power3.out" }, 55.5);
tl.fromTo("#close-line", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 56.0);
tl.fromTo("#close-sub", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5 }, 56.5);
tl.fromTo("#close-url", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, 57.0);

window.__timelines["main"] = tl;
