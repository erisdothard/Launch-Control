// Launch Control: site scripts

// Where inbound inquiries go. Point this at the Launch Control CRM
// (e.g. a Supabase edge function or REST endpoint) once it exists.
// While empty, submissions are logged to the console only.
const CRM_ENDPOINT = "";

document.querySelectorAll("#year").forEach((el) => {
  el.textContent = new Date().getFullYear();
});

// Mobile nav
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

// Pricing buttons preselect the plan in the contact form
const form = document.getElementById("lead-form");
document.querySelectorAll("[data-plan]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (form) form.elements.plan.value = btn.dataset.plan;
  });
});

// Lead form -> CRM
if (form) {
  const status = form.querySelector(".form__status");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.className = "form__status";

    // Honeypot: bots fill hidden fields, humans don't
    if (form.elements.website.value) return;

    let valid = true;
    form.querySelectorAll("[required]").forEach((field) => {
      const ok = field.value.trim() !== "" && field.checkValidity();
      field.classList.toggle("invalid", !ok);
      if (!ok) valid = false;
    });
    if (!valid) {
      status.textContent = "Please fill in your name, company and a valid email.";
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
      status.textContent = "Thanks! We'll be in touch within one business day.";
      status.classList.add("ok");
    } catch (err) {
      console.error(err);
      status.textContent = "Something went wrong. Please try again or email us directly.";
      status.classList.add("err");
    } finally {
      submit.disabled = false;
    }
  });
}
