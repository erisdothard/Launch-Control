/*
  The ONE content file. Every word on the site comes from here.
  Components must not contain literal copy.

  Assumption on record (2026-10-03): Launch Control is a launch service that takes a business
  from zero to launched. If that changes, change this file and nothing else.

  Copy rules (DESIGN.md voice): plain, confident, mechanical. Verbs first. No buzzwords. No em-dashes.
  Numbers only when real. Client data never appears here: project images are the clients' PUBLIC
  pages or demo dashboards with fictional users, and the CRM mock is invented.
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

const linkSchema = z.object({ label: z.string(), href: z.string() });

const shotSchema = z.object({
  src: z.string().startsWith("/work/"),
  alt: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const clientSchema = z.object({
  name: z.string(),
  href: z.string().url().optional(),
  /** Optional mark shown before the name. */
  mark: z.object({ src: z.string().startsWith("/clients/"), width: z.number(), height: z.number() }).optional(),
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
    ogHeadline: z.string(),
  }),
  nav: z.array(z.object({ label: z.string(), href: z.string().startsWith("#") })).max(4),
  hero: z.object({
    eyebrow: z.array(z.string()).min(1).max(5),
    title: z.string(),
    body: z.string(),
    primaryCta: linkSchema,
    secondaryCta: linkSchema,
    webglOffNotice: z.string(),
  }),
  clients: z.object({
    label: z.string(),
    items: z.array(clientSchema).min(2).max(6),
  }),
  /** Not shown on the page: the beat ids name the engine's scroll timeline (scrollMap). */
  beats: z.array(beatSchema).length(6),
  work: z.object({
    id: z.literal("work"),
    title: z.string(),
    intro: z.string(),
    visitLabel: z.string(),
    featured: z.object({
      client: z.string(),
      title: z.string(),
      summary: z.string(),
      href: z.string().url(),
      year: z.string().length(4),
      shots: z.object({ hero: shotSchema, phone: shotSchema, more: z.array(shotSchema).min(1).max(3) }),
      layers: z.array(z.object({ tag: z.string(), title: z.string(), items: z.array(z.string()).min(3).max(8) })).length(3),
      stackTitle: z.string(),
      stack: z.array(z.string()).min(4).max(10),
      agents: z.object({
        title: z.string(),
        body: z.string(),
        guarantees: z.array(z.string()).min(2).max(4),
      }),
      mock: z.object({
        label: z.string(),
        demoNote: z.string(),
        stats: z.array(z.object({ label: z.string(), value: z.string() })).length(3),
        briefingTitle: z.string(),
        briefing: z
          .array(z.object({ name: z.string(), kind: z.string(), reason: z.string(), priority: z.enum(["High", "Medium", "Low"]) }))
          .min(3)
          .max(5),
      }),
    }),
    more: z
      .array(
        z.object({
          client: z.string(),
          title: z.string(),
          summary: z.string(),
          href: z.string().url(),
          year: z.string().length(4),
          demoNote: z.string().optional(),
          shots: z.object({ hero: shotSchema, phone: shotSchema }),
        }),
      )
      .min(1)
      .max(3),
  }),
  build: z.object({
    id: z.literal("build"),
    title: z.string(),
    intro: z.string(),
    services: z.array(serviceSchema).min(3).max(6),
  }),
  book: z.object({
    id: z.literal("book"),
    title: z.string(),
    body: z.string(),
    afterNote: z.string(),
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
    blurb: z.string(),
    navLabel: z.string(),
    contactLabel: z.string(),
    email: z.string().email(),
    location: z.string(),
    socialLabel: z.string(),
    social: z.array(linkSchema).max(4),
    credit: z.object({
      prefix: z.string(),
      modelName: z.string(),
      author: z.string(),
      license: z.string(),
      href: z.string().url(),
    }),
    legal: z.string(),
  }),
  notFound: z.object({
    title: z.string(),
    body: z.string(),
    cta: linkSchema,
  }),
});

export type SiteContent = z.infer<typeof siteSchema>;
export type Beat = z.infer<typeof beatSchema>;
export type BeatId = Beat["id"];
export type Shot = z.infer<typeof shotSchema>;

const content: SiteContent = {
  brand: {
    name: "Launch Control",
    wordmark: "LAUNCH CONTROL",
    tagline: "From idle to launched.",
  },
  seo: {
    title: "Launch Control. Websites, backends and systems, built and launched.",
    description:
      "Launch Control builds the website, backend and systems a business runs on, and takes it to launch. One team, one build.",
    url: "https://launch-control-flame.vercel.app",
    ogHeadline: "We build the whole engine. Then we launch it.",
  },
  nav: [
    { label: "Work", href: "#work" },
    { label: "What we build", href: "#build" },
    { label: "Book a launch", href: "#book" },
  ],
  hero: {
    eyebrow: ["Brand", "Website", "Systems", "Automation"],
    title: "We build the whole engine. Then we launch it.",
    body: "Launch Control takes a business from idle to launched: the brand, the website, the systems behind it, and the day it goes live. One team, one build.",
    primaryCta: { label: "Book a launch", href: "#book" },
    secondaryCta: { label: "See the work", href: "#work" },
    webglOffNotice: "3D is off on this device. The site works without it.",
  },
  clients: {
    label: "Shipped for",
    items: [
      { name: "Hyper Racer USA", href: "https://www.hyperracerusa.com", mark: { src: "/clients/hyper-racer-v1.png", width: 73, height: 64 } },
      { name: "DispatchRelay", href: "https://dispatchrelay.co", mark: { src: "/clients/dispatchrelay-mark-v1.svg", width: 64, height: 64 } },
      { name: "3 Aces Trucking" },
    ],
  },
  beats: [
    { id: "idle", caption: "Every business is an engine." },
    { id: "dive", caption: "Most never get built right." },
    { id: "combustion", caption: "We build yours from the inside." },
    { id: "rev", caption: "Then we hold the revs." },
    { id: "limiter", caption: "Until it is ready." },
    { id: "launch", caption: "Launch." },
  ],
  work: {
    id: "work",
    title: "Work",
    intro: "Full builds, shipped and running. Public pages and demo dashboards shown; client data stays with the client.",
    visitLabel: "Visit site",
    featured: {
      client: "Hyper Racer USA",
      title: "One application: website, backend and CRM, connected.",
      summary:
        "The US home of the Hyper Racer X1 race car runs on one application we built end to end. The public site buyers see, the backend that takes every enquiry, and the command center the team runs the business from. Change the inventory in the admin and the site updates. A buyer sends a form and the lead is sorted by morning.",
      href: "https://www.hyperracerusa.com",
      year: "2026",
      shots: {
        hero: { src: "/work/hyper-racer-home-v1.webp", alt: "Hyper Racer USA home page: the X1 race car with its headline specs", width: 1600, height: 1000 },
        phone: { src: "/work/hyper-racer-phone-v1.webp", alt: "Hyper Racer USA home page on a phone", width: 780, height: 1688 },
        more: [
          { src: "/work/hyper-racer-inventory-v1.webp", alt: "Hyper Racer USA inventory page with cars for sale", width: 1600, height: 1000 },
          { src: "/work/hyper-racer-configurator-v1.webp", alt: "Hyper Racer USA configurator: build your X1", width: 1600, height: 1000 },
        ],
      },
      layers: [
        {
          tag: "Front end",
          title: "The public site",
          items: ["Specs and configurator", "Inventory", "Gallery, news, events", "Dealer map", "Shop", "Enquiry forms"],
        },
        {
          tag: "Backend",
          title: "Data and services",
          items: ["Postgres database", "Form intake with spam guard", "Offline event kiosk", "Sync with HQ in Australia", "Email and payments", "Scheduled daily jobs"],
        },
        {
          tag: "Admin",
          title: "The command center",
          items: ["Leads, deals, customers", "Tasks and approvals queue", "Agent activity and cost", "Editors for every page", "Full activity log"],
        },
      ],
      stackTitle: "Built with",
      stack: ["Next.js", "React", "TypeScript", "Postgres (Supabase)", "Claude agents", "Resend email", "Stripe", "Vercel"],
      agents: {
        title: "The agents inside the CRM",
        body: "Every morning the agents screen out spam, fill in missing details, sort each lead by type and urgency, schedule the next follow-up, and write a short ranked briefing. People make the calls.",
        guarantees: [
          "No email reaches a customer without a person approving it.",
          "Every automated decision shows its reasoning.",
          "Nothing is deleted. Every change is logged and reversible.",
        ],
      },
      mock: {
        label: "Command center",
        demoNote: "Illustration with demo data",
        stats: [
          { label: "Screened", value: "14" },
          { label: "Scheduled", value: "6" },
          { label: "To approve", value: "2" },
        ],
        briefingTitle: "Morning briefing",
        briefing: [
          { name: "Avery C.", kind: "Buyer", reason: "Asked for a quote twice. Never contacted.", priority: "High" },
          { name: "Sam O.", kind: "Track club", reason: "One day past the next follow-up.", priority: "High" },
          { name: "Morgan L.", kind: "Racing school", reason: "Due for step 2 of 4.", priority: "Medium" },
          { name: "Riley P.", kind: "Event organizer", reason: "Replied overnight. Draft waiting.", priority: "Medium" },
        ],
      },
    },
    more: [
      {
        client: "DispatchRelay",
        title: "A freight marketplace for carriers, brokers, shippers and drivers.",
        summary:
          "Loads, bids, dispatch and tracking on one platform, with a dashboard for each role. Built as FreightX for a trucking company, now a product of its own.",
        href: "https://dispatchrelay.co",
        year: "2026",
        demoNote: "Demo dashboards with fictional users",
        shots: {
          hero: { src: "/work/dispatchrelay-carrier-v1.webp", alt: "DispatchRelay carrier dashboard: loads to negotiate and pending dispatch", width: 1600, height: 1000 },
          phone: { src: "/work/dispatchrelay-phone-v1.webp", alt: "DispatchRelay carrier dashboard on a phone", width: 780, height: 1688 },
        },
      },
    ],
  },
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
  book: {
    id: "book",
    title: "Book a launch",
    body: "Tell us what you are launching. We reply within one working day.",
    afterNote: "What happens next: we reply within one working day and book a 30-minute call. No proposal until we have talked.",
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
    blurb: "Websites, backends and the systems behind them, built and launched by one team.",
    navLabel: "Site",
    contactLabel: "Contact",
    email: "hello@launchcontrol.example",
    location: "Nashville, Tennessee",
    socialLabel: "Elsewhere",
    social: [{ label: "GitHub", href: "https://github.com/erisdothard" }],
    credit: {
      prefix: "Engine model:",
      modelName: "Disassembled V8 Engine Block",
      author: "Tomaso",
      license: "CC BY 4.0",
      href: "https://sketchfab.com/3d-models/disassembled-v8-engine-block-3026bd87ca3945d6829d24c86ce695f0",
    },
    legal: "Launch Control",
  },
  notFound: {
    title: "That page is not here.",
    body: "The address may be wrong, or the page has moved.",
    cta: { label: "Back to the start", href: "/" },
  },
};

export const site: SiteContent = siteSchema.parse(content);
