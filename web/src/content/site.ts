/*
  The ONE content file. Every word on the site comes from here.
  Components must not contain literal copy.

  Positioning on record (Max Hartmann, "Company Branding" 2026-10-02 and "Site revisions"
  2026-10-08): Launch Control builds and operates business development systems. Brand, website,
  CRM, lead generation, outreach and automation, then we help run it. Hyper Racer USA is the
  prototype. Not a marketing agency.

  Copy rules (DESIGN.md voice): plain, confident, mechanical. Verbs first. No buzzwords. No em-dashes.
  Numbers only when real. Client data never appears here: project images are the clients' PUBLIC
  pages or screens with demo data, and any mock is invented.
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

/** One screen of a product, captured twice: a 1280x800 desktop view and a 390x844 phone view.
    The page shows whichever matches the visitor's device, so the type stays legible on both. */
const screenSchema = z.object({ label: z.string(), desk: shotSchema, phone: shotSchema });

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
      shots: z.object({ hero: shotSchema, phone: shotSchema, moreTitle: z.string(), more: z.array(screenSchema).min(1).max(4) }),
      layers: z.array(z.object({ tag: z.string(), title: z.string(), items: z.array(z.string()).min(3).max(8) })).length(3),
      stackTitle: z.string(),
      stack: z.array(z.string()).min(4).max(10),
      agents: z.object({
        title: z.string(),
        body: z.string(),
        guarantees: z.array(z.string()).min(2).max(4),
      }),
      /** Real admin screens, captured on a local instance seeded with invented leads. Never production data. */
      crm: z.object({
        title: z.string(),
        note: z.string(),
        screens: z.array(screenSchema).min(2).max(6),
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
  team: z.object({
    id: z.literal("team"),
    title: z.string(),
    intro: z.string(),
    people: z.array(z.object({ name: z.string(), role: z.string(), body: z.string() })).length(2),
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
    title: "Launch Control. Business development systems, built and run.",
    description:
      "Launch Control builds the commercial system behind a business: brand, website, CRM, lead generation, outreach and automation. Then we help run it.",
    url: "https://launch-control-flame.vercel.app",
    ogHeadline: "We build the whole engine. Then we launch it.",
  },
  nav: [
    { label: "Work", href: "#work" },
    { label: "What we do", href: "#build" },
    { label: "Team", href: "#team" },
    { label: "Book a launch", href: "#book" },
  ],
  hero: {
    eyebrow: ["Brand", "Website", "CRM", "Lead generation", "Outreach"],
    title: "We build the whole engine. Then we launch it.",
    body: "We build the commercial system behind the business: brand, website, CRM, lead generation, outreach and automation. Then we help run it.",
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
    intro: "Systems we built and now help run. Public pages and screens with demo data shown; client data stays with the client.",
    visitLabel: "Visit site",
    featured: {
      client: "Hyper Racer USA",
      title: "One system: website, CRM, pipeline and outreach, connected.",
      summary:
        "The US home of the Hyper Racer X1 race car runs on one system we built end to end. The public site buyers see, the CRM that takes every enquiry, the dealer and partner pipeline, and the outreach that goes out from it. A buyer sends a form and the lead is sorted, scheduled and followed up. We built it, and we run it with the team.",
      href: "https://www.hyperracerusa.com",
      year: "2026",
      shots: {
        hero: { src: "/work/hyper-racer-home-desk-v3.webp", alt: "Hyper Racer USA home page: the X1 race car with its headline specs", width: 2560, height: 1600 },
        phone: { src: "/work/hyper-racer-home-phone-v3.webp", alt: "Hyper Racer USA home page on a phone", width: 1170, height: 2532 },
        moreTitle: "The public site",
        more: [
          {
            label: "Inventory",
            desk: { src: "/work/hyper-racer-inventory-desk-v3.webp", alt: "Hyper Racer USA inventory page with cars for sale", width: 2560, height: 1600 },
            phone: { src: "/work/hyper-racer-inventory-phone-v3.webp", alt: "Inventory page on a phone", width: 1170, height: 2532 },
          },
          {
            label: "Configurator",
            desk: { src: "/work/hyper-racer-configurator-desk-v3.webp", alt: "Hyper Racer USA configurator: build your X1", width: 2560, height: 1600 },
            phone: { src: "/work/hyper-racer-configurator-phone-v3.webp", alt: "Configurator on a phone", width: 1170, height: 2532 },
          },
          {
            label: "Dealers",
            desk: { src: "/work/hyper-racer-dealers-desk-v3.webp", alt: "Hyper Racer USA dealer page: represent the X1, apply to become a dealer", width: 2560, height: 1600 },
            phone: { src: "/work/hyper-racer-dealers-phone-v3.webp", alt: "Dealer page on a phone", width: 1170, height: 2532 },
          },
          {
            label: "Enquiry form",
            desk: { src: "/work/hyper-racer-contact-desk-v3.webp", alt: "Hyper Racer USA enquiry form: timeline, involvement, which car, purchase readiness", width: 2560, height: 1600 },
            phone: { src: "/work/hyper-racer-contact-phone-v3.webp", alt: "Enquiry form on a phone", width: 1170, height: 2532 },
          },
        ],
      },
      layers: [
        {
          tag: "Website",
          title: "The public site",
          items: ["Specs and configurator", "Inventory", "Gallery, news, events", "Dealer map", "Shop", "Enquiry forms"],
        },
        {
          tag: "CRM and backend",
          title: "Where every lead lands",
          items: ["Leads, deals, customers", "Form intake with spam guard", "Tasks and approvals queue", "Email and payments", "Sync with HQ in Australia", "Full activity log"],
        },
        {
          tag: "Business development",
          title: "The pipeline we run",
          items: ["Dealer and partner targeting", "Prospect lists", "Outreach campaigns", "Follow-up tracking", "Qualified opportunities"],
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
      crm: {
        title: "Inside the CRM",
        note: "Real screens, demo data. Every name is invented.",
        screens: [
          {
            label: "Dashboard",
            desk: { src: "/work/hyper-racer-crm-dashboard-desk-v3.webp", alt: "Hyper Racer command center dashboard: lead counts, pipeline value and the advisor's ranked list of who to contact", width: 2560, height: 1600 },
            phone: { src: "/work/hyper-racer-crm-dashboard-phone-v3.webp", alt: "The dashboard on a phone", width: 1170, height: 2532 },
          },
          {
            label: "Leads",
            desk: { src: "/work/hyper-racer-crm-leads-desk-v3.webp", alt: "Leads list with product, type, organization, priority, next step and status for each lead", width: 2560, height: 1600 },
            phone: { src: "/work/hyper-racer-crm-leads-phone-v3.webp", alt: "The leads list on a phone", width: 1170, height: 2532 },
          },
          {
            label: "One lead",
            desk: { src: "/work/hyper-racer-crm-lead-desk-v3.webp", alt: "A single lead: the enquiry message, status, lead type and classification details", width: 2560, height: 1600 },
            phone: { src: "/work/hyper-racer-crm-lead-phone-v3.webp", alt: "A single lead on a phone", width: 1170, height: 2532 },
          },
          {
            label: "Pipeline",
            desk: { src: "/work/hyper-racer-crm-deals-desk-v3.webp", alt: "Sales pipeline board: deals by stage from inquiry to deposit with their values", width: 2560, height: 1600 },
            phone: { src: "/work/hyper-racer-crm-deals-phone-v3.webp", alt: "The pipeline on a phone", width: 1170, height: 2532 },
          },
          {
            label: "Tasks",
            desk: { src: "/work/hyper-racer-crm-tasks-desk-v3.webp", alt: "Tasks list with priority, due date, the related lead and an overdue follow-up flagged", width: 2560, height: 1600 },
            phone: { src: "/work/hyper-racer-crm-tasks-phone-v3.webp", alt: "The tasks list on a phone", width: 1170, height: 2532 },
          },
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
          hero: { src: "/work/dispatchrelay-carrier-desk-v3.webp", alt: "DispatchRelay carrier dashboard: loads to negotiate and pending dispatch", width: 2560, height: 1600 },
          phone: { src: "/work/dispatchrelay-carrier-phone-v3.webp", alt: "DispatchRelay carrier dashboard on a phone", width: 1170, height: 2532 },
        },
      },
    ],
  },
  build: {
    id: "build",
    title: "What we build and run",
    intro:
      "Not a marketing agency. We build the business development machine behind the company, then we operate it with you: find the market, find the people, contact them, track them, follow up.",
    services: [
      {
        id: "brand",
        title: "Brand and positioning",
        body: "Name, mark, voice, and the message that gets the right people interested. Who you target and how you explain what you do.",
      },
      {
        id: "site",
        title: "Website",
        body: "Designed and built to the last pixel, fast on a phone. Landing pages, lead forms and the sales material behind the outreach.",
      },
      {
        id: "crm",
        title: "CRM and pipeline",
        body: "Lead database, pipeline stages, follow-up tracking, contact history and reporting. Nothing lost in a spreadsheet or an inbox.",
      },
      {
        id: "leads",
        title: "Lead generation",
        body: "We find the customers, partners, dealers, distributors or sponsors your business needs, and the decision makers inside them.",
      },
      {
        id: "outreach",
        title: "Outreach and follow-up",
        body: "Prospect lists, campaigns, replies, qualification and the next step, with agents doing the repetitive work and a person approving every send.",
      },
      {
        id: "retainer",
        title: "After launch",
        body: "Ongoing growth, not maintenance: lead generation, outreach, CRM management and new campaigns, month after month.",
      },
    ],
  },
  team: {
    id: "team",
    title: "Who you work with",
    intro: "Two people, the whole model. One finds the market and works the pipeline. One builds the system and keeps it running.",
    people: [
      {
        name: "Maxwell Hartmann",
        role: "Business development and market strategy",
        body: "Finds the market, the people and the message. Builds the prospect lists, runs the outreach and the follow-up, and moves opportunities forward.",
      },
      {
        name: "Eris Dothard",
        role: "Systems and development",
        body: "Builds the website, the CRM, the backend and the agents inside it, and keeps all of it running after launch.",
      },
    ],
  },
  book: {
    id: "book",
    title: "Book a launch",
    body: "Tell us what you sell and who you need to reach. We reply within one working day.",
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
    blurb: "Business development systems: brand, website, CRM, lead generation and outreach, built and run by one team.",
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
