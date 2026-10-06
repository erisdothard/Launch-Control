// Launch Control: site scripts

// Where inbound inquiries go. Point this at the Launch Control CRM intake
// endpoint once it exists. While empty, submissions are logged to the console.
const CRM_ENDPOINT = "";

// Ticker numbers. Replace with live values from the CRM when wired up.
const TICKER = { prospects: 1240, outreach: 3811, followups: 46, opps: 23 };

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.querySelectorAll("#year").forEach((el) => {
  el.textContent = new Date().getFullYear();
});

/* ---------- Nav ---------- */
const nav = document.querySelector(".nav");
const toggle = document.querySelector(".nav__toggle");
const links = document.querySelector(".nav__links");

const onScroll = () => nav && nav.classList.toggle("scrolled", window.scrollY > 40);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

if (toggle && links) {
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  links.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      links.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    })
  );
}

/* ---------- Hero: video if present, canvas placeholder otherwise ---------- */
const hero = document.querySelector(".hero");
const video = document.querySelector(".hero__video");
const canvas = document.querySelector(".hero__canvas");

if (video) {
  // Only show the video once we know a source actually loaded.
  video.addEventListener("loadeddata", () => hero.classList.add("has-video"));
  video.addEventListener("error", () => hero.classList.remove("has-video"), true);
}

if (canvas && !reduceMotion) {
  // "Light trails at speed": streaks converging on a vanishing point.
  // Pure placeholder until real footage lands in assets/hero.mp4.
  const ctx = canvas.getContext("2d");
  let w, h, streaks = [];

  const resize = () => {
    w = canvas.width = canvas.offsetWidth * devicePixelRatio;
    h = canvas.height = canvas.offsetHeight * devicePixelRatio;
  };
  const spawn = () => ({
    angle: Math.random() * Math.PI * 2,
    dist: Math.random() * 0.2,
    speed: 0.004 + Math.random() * 0.012,
    width: (0.5 + Math.random() * 1.5) * devicePixelRatio,
    volt: Math.random() < 0.18,
  });

  resize();
  window.addEventListener("resize", resize);
  for (let i = 0; i < 160; i++) streaks.push({ ...spawn(), dist: Math.random() });

  const draw = () => {
    ctx.fillStyle = "rgba(10,10,10,0.35)";
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.62, cy = h * 0.42, maxR = Math.hypot(w, h);
    for (const s of streaks) {
      const r0 = s.dist * maxR, r1 = (s.dist + s.speed * 6) * maxR;
      const a = Math.min(1, s.dist * 2.2);
      ctx.strokeStyle = s.volt ? `rgba(200,255,0,${a})` : `rgba(255,255,255,${a * 0.6})`;
      ctx.lineWidth = s.width * (0.4 + s.dist);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(s.angle) * r0, cy + Math.sin(s.angle) * r0);
      ctx.lineTo(cx + Math.cos(s.angle) * r1, cy + Math.sin(s.angle) * r1);
      ctx.stroke();
      s.dist += s.speed * (0.5 + s.dist * 2);
      if (s.dist > 1) Object.assign(s, spawn());
    }
    requestAnimationFrame(draw);
  };
  draw();
}

/* ---------- Ticker ---------- */
document.querySelectorAll("[data-ticker]").forEach((el) => {
  const v = TICKER[el.dataset.ticker];
  if (v != null) el.textContent = v.toLocaleString();
});

/* ---------- Scroll reveal + stripes + counters ---------- */
const countUp = (el) => {
  const target = Number(el.dataset.count);
  if (reduceMotion) { el.textContent = target.toLocaleString(); return; }
  const start = performance.now(), dur = 1400;
  const tick = (now) => {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      e.target.querySelectorAll("[data-count]").forEach(countUp);
      io.unobserve(e.target);
    });
  },
  { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
);
document.querySelectorAll(".reveal, .stripe--top, .board__row").forEach((el) => io.observe(el));

/* ---------- Pricing buttons preselect the stage ---------- */
const form = document.getElementById("lead-form");
document.querySelectorAll("[data-plan]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (form) form.elements.plan.value = btn.dataset.plan;
  });
});

/* ---------- Lead form -> CRM ---------- */
if (form) {
  const status = form.querySelector(".form__status");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.className = "form__status mono";

    // Honeypot: bots fill hidden fields, humans don't
    if (form.elements.website.value) return;

    let valid = true;
    form.querySelectorAll("[required]").forEach((field) => {
      const ok = field.value.trim() !== "" && field.checkValidity();
      field.classList.toggle("invalid", !ok);
      if (!ok) valid = false;
    });
    if (!valid) {
      status.textContent = "Name, company and a valid email are required.";
      status.classList.add("err");
      return;
    }

    const lead = Object.fromEntries(new FormData(form));
    delete lead.website;
    lead.source = "website";
    lead.page = location.pathname;
    lead.submitted_at = new Date().toISOString();

    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;

    try {
      if (CRM_ENDPOINT) {
        const res = await fetch(CRM_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lead),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        console.info("[Launch Control] CRM_ENDPOINT not set. Lead:", lead);
      }
      form.reset();
      status.textContent = "Received. We're back to you within one business day.";
      status.classList.add("ok");
    } catch (err) {
      console.error(err);
      status.textContent = "Something went wrong. Try again or email us directly.";
      status.classList.add("err");
    } finally {
      submit.disabled = false;
    }
  });
}
