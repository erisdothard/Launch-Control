// Launch Control: page scripts (nav, HUD ticker, section reveals, lead form).
// The WebGL circuit lives in scene.js.

// Where inbound inquiries go. Point this at the Launch Control CRM intake
// endpoint once it exists. While empty, submissions are logged to the console.
const CRM_ENDPOINT = "";

// Calendar booking link (Calendly, Cal.com, ...). Empty = every "book" button goes to the form.
const BOOKING_URL = "";

// HUD numbers. Replace with live values from the CRM when wired up.
const TICKER = { prospects: 1240, outreach: 3811, followups: 46 };

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.querySelectorAll("#year").forEach((el) => (el.textContent = new Date().getFullYear()));

/* ---------- Nav ---------- */
const toggle = document.querySelector(".nav__toggle");
const links = document.querySelector(".nav__links");
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

/* ---------- Booking buttons ---------- */
document.querySelectorAll("[data-booking]").forEach((a) => {
  if (BOOKING_URL) { a.href = BOOKING_URL; a.target = "_blank"; a.rel = "noopener"; }
});

/* ---------- Sticky CTA: show from the services beat until the contact form is on screen ---------- */
const sticky = document.querySelector(".sticky-cta");
const servicesEl = document.getElementById("services");
const contactEl = document.getElementById("contact");
if (sticky && servicesEl && contactEl) {
  const update = () => {
    const past = servicesEl.getBoundingClientRect().top < innerHeight * 0.5;
    const atContact = contactEl.getBoundingClientRect().top < innerHeight * 0.7;
    sticky.hidden = !(past && !atContact);
  };
  addEventListener("scroll", update, { passive: true }); update();
}

/* ---------- HUD ticker ---------- */
document.querySelectorAll("[data-ticker]").forEach((el) => {
  const v = TICKER[el.dataset.ticker];
  if (v != null) el.textContent = v.toLocaleString();
});

/* ---------- Section reveal + counters ---------- */
const countUp = (el) => {
  const target = Number(el.dataset.count);
  if (reduceMotion) { el.textContent = target.toLocaleString(); return; }
  const start = performance.now(), dur = 1400;
  const tick = (now) => {
    const p = Math.min(1, (now - start) / dur);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

document.querySelectorAll(".board__row").forEach((row, i) => row.style.setProperty("--i", i));

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      e.target.querySelectorAll("[data-count]").forEach(countUp);
      io.unobserve(e.target);
    });
  },
  { threshold: 0.2 }
);
document.querySelectorAll(".beat").forEach((el) => io.observe(el));
// Belt and braces: also reveal on scroll position, so a slow frame never leaves a panel hidden.
const sectors = [...document.querySelectorAll(".beat")];
const revealByScroll = () => {
  sectors.forEach((s) => {
    if (s.classList.contains("in")) return;
    if (s.getBoundingClientRect().top < innerHeight * 0.8) { s.classList.add("in"); s.querySelectorAll("[data-count]").forEach(countUp); io.unobserve(s); }
  });
};
addEventListener("scroll", revealByScroll, { passive: true });
revealByScroll();

/* ---------- Pricing buttons preselect the stage ---------- */
const form = document.getElementById("lead-form");
document.querySelectorAll("[data-plan]").forEach((btn) => {
  btn.addEventListener("click", () => { if (form) form.elements.plan.value = btn.dataset.plan; });
});

/* ---------- Lead form -> CRM ---------- */
if (form) {
  const status = form.querySelector(".form__status");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.className = "form__status mono";
    if (form.elements.website.value) return; // honeypot

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
        const res = await fetch(CRM_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) });
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
