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
  proof: z.object({
    id: z.literal("proof"),
    title: z.string(),
    stats: z.array(statSchema).max(3),
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
      "Launch Control builds the whole engine of a business and takes it to launch: brand, site, systems, go-live.",
    url: "https://launchcontrol.example",
  },
  nav: [
    { label: "Build", href: "#build" },
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
        body: "Monitoring, fixes and the next build, on a monthly retainer. The engine keeps running.",
      },
    ],
  },
  proof: {
    id: "proof",
    title: "Proof",
    stats: [],
    work: [
      {
        title: "FreightX",
        body: "A multi-role freight marketplace for a trucking company. Shippers, carriers and dispatch on one platform.",
        year: "2026",
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
