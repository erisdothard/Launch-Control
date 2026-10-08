/*
  The ONE content file. Every word on the site comes from here.
  Components must not contain literal copy.

  Assumption on record (2026-10-03): Launch Control is a launch service that takes a business
  from zero to launched. If that changes, change this file and nothing else.

  Copy rules (DESIGN.md voice): plain, confident, mechanical. Verbs first. No buzzwords. No em-dashes.
  Numbers only when real; the proof stats strip is omitted when `stats` is empty.
*/

import { z } from "zod";

const beatSchema = z.object({
  id: z.enum(["idle", "dive", "combustion", "rev", "limiter", "launch"]),
  caption: z.string().min(1),
});

const serviceSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
});

const workSchema = z.object({
  title: z.string(),
  body: z.string(),
  year: z.string().length(4),
  href: z.string().url().optional(),
  /** Shown as the large lead entry. At most one. */
  featured: z.boolean().optional(),
});

const statSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export const siteSchema = z.object({
  brand: z.object({
    name: z.string(),
    wordmark: z.string(),
    tagline: z.string(),
  }),
  seo: z.object({
    title: z.string(),
    description: z.string(),
    url: z.string().url(),
  }),
  nav: z
    .array(z.object({ label: z.string(), href: z.string().startsWith("#") }))
    .max(4),
  hero: z.object({
    eyebrow: z.array(z.string()).min(1).max(5),
    title: z.string(),
    body: z.string(),
    primaryCta: z.object({ label: z.string(), href: z.string().startsWith("#") }),
    secondaryCta: z.object({ label: z.string(), href: z.string().startsWith("#") }),
    webglOffNotice: z.string(),
  }),
  /** Not shown on the page: the beat ids name the engine's scroll timeline (scrollMap). */
  beats: z.array(beatSchema).length(6),
  build: z.object({
    id: z.literal("build"),
    title: z.string(),
    intro: z.string(),
    services: z.array(serviceSchema).min(3).max(6),
  }),
  crm: z.object({
    id: z.literal("crm"),
    eyebrow: z.string(),
    title: z.string(),
    intro: z.string(),
    layers: z
      .array(z.object({ tag: z.string(), title: z.string(), body: z.string(), items: z.array(z.string()).min(3).max(8) }))
      .length(3),
    flowsTitle: z.string(),
    flows: z.array(z.object({ from: z.string(), to: z.string() })).min(2).max(4),
    stackTitle: z.string(),
    stack: z.array(z.string()).min(4).max(10),
    agentsTitle: z.string(),
    steps: z.array(z.object({ title: z.string(), body: z.string() })).min(3).max(6),
    guarantees: z.array(z.string()).min(2).max(4),
    cta: z.object({ label: z.string(), href: z.string().url() }),
    mock: z.object({
      label: z.string(),
      demoNote: z.string(),
      stats: z.array(z.object({ label: z.string(), value: z.string() })).length(3),
      briefingTitle: z.string(),
      briefing: z
        .array(z.object({ name: z.string(), kind: z.string(), reason: z.string(), priority: z.enum(["High", "Medium", "Low"]) }))
        .min(3)
        .max(5),
      cadenceTitle: z.string(),
      cadence: z.array(z.object({ temp: z.string(), days: z.string() })).min(2).max(4),
    }),
  }),
  proof: z.object({
    id: z.literal("proof"),
    title: z.string(),
    stats: z.array(statSchema).max(3),
    visitLabel: z.string(),
    work: z.array(workSchema).min(1),
  }),
  book: z.object({
    id: z.literal("book"),
    title: z.string(),
    body: z.string(),
    fields: z.object({
      name: z.string(),
      email: z.string(),
      launching: z.string(),
      budget: z.string(),
      budgetOptions: z.array(z.string()).length(3),
    }),
    submit: z.string(),
    submitting: z.string(),
    success: z.string(),
    errors: z.object({
      required: z.string(),
      email: z.string(),
      network: z.string(),
      retry: z.string(),
    }),
  }),
  footer: z.object({
    credit: z.object({
      prefix: z.string(),
      modelName: z.string(),
      author: z.string(),
      license: z.string(),
      href: z.string().url(),
    }),
    email: z.string().email(),
    legal: z.string(),
  }),
});

export type SiteContent = z.infer<typeof siteSchema>;
export type Beat = z.infer<typeof beatSchema>;
export type BeatId = Beat["id"];

const content: SiteContent = {
  brand: {
    name: "Launch Control",
    wordmark: "LAUNCH CONTROL",
    tagline: "Hold the revs. Then let go.",
  },
  seo: {
    title: "Launch Control. From idle to launched.",
    description:
      "Launch Control builds the website, backend and systems a business runs on, and takes it to launch: brand, site, systems, go-live.",
    url: "https://launchcontrol.example",
  },
  nav: [
    { label: "Build", href: "#build" },
    { label: "Hyper Racer", href: "#crm" },
    { label: "Proof", href: "#proof" },
    { label: "Book a launch", href: "#book" },
  ],
  hero: {
    eyebrow: ["Brand", "Website", "Systems", "Automation"],
    title: "We build the whole engine. Then we launch it.",
    body: "Launch Control takes a business from idle to launched: the brand, the website, the systems behind it, and the day it goes live. One team, one build.",
    primaryCta: { label: "Book a launch", href: "#book" },
    secondaryCta: { label: "See the work", href: "#proof" },
    webglOffNotice: "3D is off on this device. The site works without it.",
  },
  beats: [
    { id: "idle", caption: "Every business is an engine." },
    { id: "dive", caption: "Most never get built right." },
    { id: "combustion", caption: "We build yours from the inside." },
    { id: "rev", caption: "Then we hold the revs." },
    { id: "limiter", caption: "Until it is ready." },
    { id: "launch", caption: "Launch." },
  ],
  build: {
    id: "build",
    title: "What we build",
    intro:
      "No decks. No handoffs between five vendors. You get a working business with every part connected, and we stay on after launch to keep it running.",
    services: [
      {
        id: "brand",
        title: "Brand",
        body: "Name, mark, voice and the rules that keep them consistent after we leave.",
      },
      {
        id: "site",
        title: "Website",
        body: "Designed and built to the last pixel, fast on a phone, measured against real references, not templates.",
      },
      {
        id: "systems",
        title: "Systems",
        body: "CRM, booking, payments, email, the back office. Connected so one entry moves through all of it.",
      },
      {
        id: "automation",
        title: "Automation",
        body: "The repetitive work handled by software and agents, with a human in the loop where it matters.",
      },
      {
        id: "retainer",
        title: "After launch",
        body: "Monitoring, fixes and the next build, on a monthly retainer. We keep it running.",
      },
    ],
  },
  crm: {
    id: "crm",
    eyebrow: "Featured build · Hyper Racer USA",
    title: "One application. Website, backend and CRM, connected.",
    intro:
      "Hyper Racer USA runs on one application we built end to end: the public site buyers see, the backend that takes every enquiry, and the command center the team runs the business from. Change the inventory in the admin and the site updates. A buyer sends a form and the lead is sorted by morning.",
    layers: [
      {
        tag: "Front end",
        title: "The public site",
        body: "Image-led pages for a race car brand, fast on a phone.",
        items: ["Specs and configurator", "Inventory", "Gallery, news, events", "Dealer map", "Shop", "Enquiry forms"],
      },
      {
        tag: "Backend",
        title: "Data and services",
        body: "Database, intake, email and scheduled jobs: one store for content, leads and history.",
        items: ["Postgres database", "Form intake with spam guard", "Offline event kiosk", "Sync with HQ in Australia", "Email and payments", "Scheduled daily jobs"],
      },
      {
        tag: "Admin",
        title: "The command center",
        body: "Where the team runs sales and the site, in one login.",
        items: ["Leads, deals, customers", "Tasks and approvals queue", "Agent activity and cost", "Editors for every page", "Full activity log"],
      },
    ],
    flowsTitle: "How the parts talk",
    flows: [
      { from: "Inventory edited in the admin", to: "the public page refreshes on save" },
      { from: "A buyer sends the enquiry form", to: "one deduplicated lead, sorted and scheduled by morning" },
      { from: "Any change, by a person or the software", to: "written to a permanent history" },
    ],
    stackTitle: "Built with",
    stack: ["Next.js", "React", "TypeScript", "Postgres (Supabase)", "Claude agents", "Resend email", "Stripe", "Vercel"],
    agentsTitle: "The agents inside the CRM",
    steps: [
      { title: "Screen", body: "Spam and bots pulled out before anyone sees them. Tagged, never deleted." },
      { title: "Fill in", body: "Company, role and region read out of what the lead wrote. Only blanks are filled." },
      { title: "Sort", body: "Type, next step and urgency for every lead, each with a sentence saying why." },
      { title: "Schedule", body: "The next follow-up lands on a date. Hot leads are chased in days, cold ones in weeks." },
      { title: "Brief", body: "Overnight work becomes a short ranked list: who to call, why, and what to say." },
    ],
    guarantees: [
      "No email reaches a customer without a person approving it.",
      "Every automated decision shows its reasoning.",
      "Nothing is deleted. Every change is logged and reversible.",
    ],
    cta: { label: "See the live site", href: "https://www.hyperracerusa.com" },
    mock: {
      label: "Command center",
      demoNote: "Illustration with demo data",
      stats: [
        { label: "Screened today", value: "14" },
        { label: "Follow-ups set", value: "6" },
        { label: "Drafts to approve", value: "2" },
      ],
      briefingTitle: "Morning briefing",
      briefing: [
        { name: "Avery C.", kind: "Buyer", reason: "Asked for a quote twice. Never contacted.", priority: "High" },
        { name: "Sam O.", kind: "Track club", reason: "One day past the next follow-up.", priority: "High" },
        { name: "Morgan L.", kind: "Racing school", reason: "Due for step 2 of 4.", priority: "Medium" },
        { name: "Riley P.", kind: "Event organizer", reason: "Replied overnight. Draft waiting.", priority: "Medium" },
      ],
      cadenceTitle: "Follow-up cadence",
      cadence: [
        { temp: "Hot", days: "Day 0 · 1 · 3 · 7 · 14" },
        { temp: "Warm", days: "Day 1 · 3 · 7 · 14 · 30" },
        { temp: "Cold", days: "Day 3 · 14 · 45" },
      ],
    },
  },
  proof: {
    id: "proof",
    title: "Proof",
    stats: [],
    visitLabel: "Visit site",
    work: [
      {
        title: "Hyper Racer USA",
        body: "The US home of the Hyper Racer X1 ground-effects race car. A full marketing site with specs, inventory, gallery and a configurator, plus the CRM behind it: leads, deals, customers, and an agent layer that classifies leads and drafts follow-ups.",
        year: "2026",
        href: "https://www.hyperracerusa.com",
        featured: true,
      },
      {
        title: "DispatchRelay",
        body: "A multi-role freight marketplace for carriers, brokers, shippers and drivers. Loads, dispatch and tracking on one platform.",
        year: "2026",
        href: "https://dispatchrelay.co",
      },
    ],
  },
  book: {
    id: "book",
    title: "Book a launch",
    body: "Tell us what you are launching. We reply within one working day.",
    fields: {
      name: "Name",
      email: "Email",
      launching: "What are you launching",
      budget: "Budget",
      budgetOptions: ["Under 10k", "10k to 30k", "Over 30k"],
    },
    submit: "Book a launch",
    submitting: "Booking",
    success: "Booked. We reply within one working day.",
    errors: {
      required: "This field is required.",
      email: "Enter a valid email address.",
      network: "The booking did not send.",
      retry: "Try again",
    },
  },
  footer: {
    credit: {
      prefix: "Engine model:",
      modelName: "Disassembled V8 Engine Block",
      author: "Tomaso",
      license: "CC BY 4.0",
      href: "https://sketchfab.com/3d-models/disassembled-v8-engine-block-3026bd87ca3945d6829d24c86ce695f0",
    },
    email: "hello@launchcontrol.example",
    legal: "Launch Control",
  },
};

export const site: SiteContent = siteSchema.parse(content);
