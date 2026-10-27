// Launch Control CRM sales demo. Script: demo-video/SCRIPT.md. All CRM coordinates are in the
// captured 1440x900 screen space (R = rects measured on the real CRM at capture time).
window.__timelines = window.__timelines || {};
const R = __RECTS__;
const tl = gsap.timeline({ paused: true });

const W = 1300;
const H = 813;
const K = W / 1440; // base fit of the 1440x900 CRM into the window
const SCROLL = { lead_new: 400, lead_compose: 400, calendar_call: 120, deals_before: 100, deals_after: 100 };

// ---------- helpers ----------
const c = (state, id) => {
  const r = R[state][id];
  const dy = r.x > 240 ? SCROLL[state] || 0 : 0; // the sidebar never scrolls
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 - dy, r: { ...r, y: r.y - dy } };
};
let zoomNow = 1;
function cam(z, px, py, at, dur = 0.9) {
  const s = K * z;
  const x = Math.min(0, Math.max(W - s * 1440, W / 2 - s * px));
  const y = Math.min(0, Math.max(H - s * 900, H / 2 - s * py));
  tl.to("#view", { scale: s, x, y, duration: dur, ease: "power3.inOut" }, at);
  tl.to("#cursor", { scale: 1 / z, duration: dur, ease: "power3.inOut" }, at);
  zoomNow = z;
}
const camOn = (state, id, z, at, dur) => { const p = c(state, id); cam(z, p.x, p.y, at, dur); };
function screenIn(state, at) {
  tl.fromTo("#s-" + state, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power1.out" }, at);
}
function screenOut(state, at) {
  tl.to("#s-" + state, { opacity: 0, duration: 0.3, ease: "power1.in" }, at);
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
function spot(rect, label, from, to, below = false, pad = 8) {
  const id = "spot" + spotN++;
  const el = document.createElement("div");
  el.className = "spot";
  el.id = id;
  Object.assign(el.style, { left: rect.x - pad + "px", top: rect.y - pad + "px", width: rect.w + pad * 2 + "px", height: rect.h + pad * 2 + "px" });
  el.innerHTML = `<div class="lbl${below ? " below" : ""}">${label}</div>`;
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
tl.set("#s-today_new [data-hf=row0]", { opacity: 0 }, 0);
tl.set("#view", { scale: K, x: 0, y: 0 }, 0);
tl.set("#cursor", { scale: 1 }, 0);
tl.set(["#win", "#rail"], { opacity: 0 }, 0);

// ---------- 0: hook ----------
tl.from("#hook .stripe", { scaleX: 0, transformOrigin: "0 50%", duration: 0.8, ease: "expo.out" }, 0);
["#h1", "#h2", "#h3", "#h4"].forEach((h, i) => tl.fromTo(h, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.3 + i * 1.05));
tl.to(["#h1", "#h2", "#h3"], { opacity: 0.25, duration: 0.4 }, 4.0);
tl.to("#hook", { opacity: 0, duration: 0.5 }, 5.0);

// ---------- 1: brand ----------
tl.to("#brand", { opacity: 1, duration: 0.4 }, 5.0);
tl.fromTo("#brand-logo", { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.8, ease: "power3.out" }, 5.2);
tl.fromTo("#brand-line", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 5.8);
tl.from("#brand-bar", { scaleX: 0, duration: 0.7, ease: "expo.out" }, 6.2);
tl.to("#brand", { opacity: 0, duration: 0.5 }, 8.2);

// ---------- 2: the inquiry lands ----------
tl.fromTo("#win", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 8.4);
tl.fromTo("#rail", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 8.6);
screenIn("today_new", 8.4);
caption(2, 8.7, 16.6);
tl.fromTo("#form", { opacity: 0, y: 30, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "power3.out" }, 8.9);
["#fv-name", "#fv-email", "#fv-msg"].forEach((f, i) => tl.to(f, { opacity: 1, duration: 0.35 }, 9.4 + i * 0.45));
cursorShow(900, 760, 9.6);
cursorTo(557, 568, 10.4, 0.6);
click(557, 568, 11.1);
tl.to("#fsend", { scale: 0.95, duration: 0.08, yoyo: true, repeat: 1 }, 11.1);
{
  const row = c("today_new", "row0");
  tl.to("#form", { x: row.x - 730, y: row.y - 365, scale: 0.14, opacity: 0, duration: 0.7, ease: "power3.in" }, 11.35);
}
cursorHide(11.4);
tl.fromTo("#s-today_new [data-hf=row0]", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.5, ease: "back.out(1.5)" }, 12.0);
rail(0, 12.1);
tick(2, 1, 12.2);
camOn("today_new", "row0", 1.45, 12.5, 0.9);
spot(c("today_new", "row0").r, "New inquiry · first on your list", 13.5, 16.3);
tick(2, 2, 13.4);
tick(2, 3, 14.2);

// ---------- 3: reply once, follow-up set ----------
cam(1, 0, 0, 16.4, 0.6);
screenOut("today_new", 16.7);
screenIn("lead_new", 16.8);
caption(3, 16.9, 26.7);
scroll("lead_new", 17.6, 0.9);
camOn("lead_new", "composer", 1.45, 18.0, 0.9);
{
  const ta = c("lead_new", "textarea").r;
  tl.set("#typed", { left: ta.x, top: ta.y, width: ta.w, height: ta.h }, 18.9);
  tl.to("#typed", { opacity: 1, duration: 0.1 }, 19.0);
  const text = "Hi Jake, thanks for reaching out.\n\nOur F2000 race weekends are built for exactly that jump: car, coach and crew handled, so you just drive. Your Spec Miata seasons are a great base.\n\nWant me to send the details?";
  const o = { n: 0 };
  tl.to(o, { n: text.length, duration: 2.4, ease: "none", onUpdate: () => { document.getElementById("typed").textContent = text.slice(0, Math.round(o.n)); } }, 19.1);
  const send = c("lead_new", "send");
  cursorShow(send.x + 220, send.y + 60, 21.3);
  cursorTo(send.x, send.y, 21.5, 0.55);
  click(send.x, send.y, 22.2);
}
rail(1, 22.3);
tick(3, 1, 22.4);
tl.to("#typed", { opacity: 0, duration: 0.2 }, 22.5);
cursorHide(22.5);
screenOut("lead_new", 22.5);
screenIn("lead_sent", 22.6);
camOn("lead_sent", "next", 1.15, 22.7, 0.9);
tick(3, 2, 23.2);
spot(c("lead_sent", "next").r, "Follow-up already scheduled", 23.8, 26.4, true);
rail(2, 23.9);
tick(3, 3, 24.0);

// ---------- 4: he writes back, the answer is drafted ----------
cam(1, 0, 0, 26.5, 0.6);
screenOut("lead_sent", 26.8);
screenIn("today_reply_closed", 26.9);
caption(4, 27.0, 35.8);
camOn("today_reply_closed", "row0", 1.4, 27.5, 0.8);
{
  const ch = c("today_reply_closed", "chev0");
  cursorShow(ch.x - 200, ch.y + 160, 28.1);
  cursorTo(ch.x, ch.y, 28.3, 0.6);
  click(ch.x, ch.y, 29.0);
}
tick(4, 1, 28.6);
tl.to("#s-today_reply_closed", { opacity: 0, duration: 0.2 }, 29.15);
tl.fromTo("#s-today_reply_open", { opacity: 0 }, { opacity: 1, duration: 0.25 }, 29.15);
cursorHide(29.4);
camOn("today_reply_open", "draft", 1.55, 29.6, 0.8);
spot(c("today_reply_open", "draft").r, "Drafted for you · you send it", 30.6, 32.6);
tick(4, 2, 30.7);
{
  const b = c("today_reply_open", "primary");
  cursorShow(b.x + 240, b.y + 90, 32.4);
  cursorTo(b.x, b.y, 32.6, 0.55);
  click(b.x, b.y, 33.3);
  tl.to("#s-today_reply_open [data-hf=primary]", { scale: 0.96, duration: 0.08, yoyo: true, repeat: 1 }, 33.3);
}
tl.fromTo("#toast", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.3, ease: "back.out(2)" }, 33.5);
tick(4, 3, 33.6);
cursorHide(33.8);
tl.to("#toast", { opacity: 0, duration: 0.3 }, 35.4);

// ---------- 5: the call is booked ----------
cam(1, 0, 0, 35.6, 0.6);
screenOut("today_reply_open", 35.8);
scroll("calendar_call", 35.8);
screenIn("calendar_call", 35.9);
caption(5, 36.0, 42.4);
rail(3, 36.4);
camOn("calendar_call", "callitem", 1.6, 36.6, 0.9);
spot(c("calendar_call", "callitem").r, "Linked to Jake · in Outlook", 37.6, 39.8, true);
tick(5, 1, 37.7);
tick(5, 2, 38.5);
tick(5, 3, 39.3);
camOn("calendar_call", "day30", 1.5, 39.9, 0.8);
spot(c("calendar_call", "day30").r, "Thursday · 1:00", 40.8, 42.2, false, 4);

// ---------- 6: drag to Won ----------
cam(1, 0, 0, 42.3, 0.6);
screenOut("calendar_call", 42.5);
scroll("deals_before", 42.5);
scroll("deals_after", 42.5);
screenIn("deals_before", 42.6);
caption(6, 42.7, 50.8);
cam(1.15, 870, 470, 43.2, 0.9);
{
  const a = c("deals_before", "jakecard");
  const b = c("deals_after", "jakecard");
  const grab = { x: a.r.x + 70, y: a.r.y + 40 };
  tl.set("#floater", { left: a.r.x, top: a.r.y, x: 0, y: 0, rotation: 0 }, 0);
  cursorShow(grab.x + 260, grab.y + 140, 43.8);
  cursorTo(grab.x, grab.y, 44.0, 0.6);
  tl.to("#cursor", { scale: 0.85 / 1.15, duration: 0.1 }, 44.7);
  tl.set("#floater", { opacity: 1 }, 44.75);
  tl.set("#s-deals_before [data-hf=jakecard]", { opacity: 0 }, 44.75);
  tl.to("#floater", { x: b.r.x - a.r.x, y: b.r.y - a.r.y, rotation: 2, duration: 1.3, ease: "power2.inOut" }, 44.8);
  cursorTo(grab.x + (b.r.x - a.r.x), grab.y + (b.r.y - a.r.y), 44.8, 1.3);
  rail(4, 44.9);
  tl.to("#floater", { rotation: 0, duration: 0.15 }, 46.1);
  tl.to("#cursor", { scale: 1 / 1.15, duration: 0.1 }, 46.1);
  tl.to("#s-deals_before", { opacity: 0, duration: 0.3 }, 46.15);
  tl.fromTo("#s-deals_after", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 46.15);
  tl.to("#floater", { opacity: 0, duration: 0.2 }, 46.5);
}
rail(5, 46.3);
tick(6, 1, 46.3);
cursorHide(46.6);
camOn("deals_after", "colwon", 1.5, 46.8, 0.8);
spot(c("deals_after", "wonhead").r, "Won · $27,000", 47.7, 50.4);
tick(6, 2, 47.8);
tick(6, 3, 48.6);

// ---------- 7: a normal morning ----------
cam(1, 0, 0, 50.5, 0.6);
screenOut("deals_after", 50.7);
screenIn("today_morning", 50.8);
caption(7, 50.9, 57.2);
tl.to("#view", { scale: K * 1.04, x: W - K * 1.04 * 1440, y: 0, duration: 6, ease: "sine.inOut" }, 51.2);
spot(c("today_morning", "list").r, "Who to answer, in order", 51.9, 54.4);
tick(7, 1, 52.0);
tick(7, 2, 52.8);
tick(7, 3, 53.6);
spot(c("today_morning", "pipeline").r, "Your pipeline, live", 54.6, 56.9);

// ---------- 8: close ----------
tl.to("#close", { opacity: 1, duration: 0.6 }, 57.2);
tl.fromTo("#close-logo", { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.8, ease: "power3.out" }, 57.5);
tl.fromTo("#close-line", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 58.0);
tl.fromTo("#close-sub", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5 }, 58.5);
tl.fromTo("#close-url", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 59.0);

window.__timelines["main"] = tl;
