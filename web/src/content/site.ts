/*
  The ONE content file. Every word on the site comes from here.
  Components must not contain literal copy.

  Positioning on record (Max Hartmann, "Company Branding" 2026-10-02, "Site revisions" 2026-10-08
  and "Next customer-facing matter" 2026-10-21): Launch Control is a commercial development company
  that builds its own technology. Commercial results first (find customers, convert opportunities,
  make growth repeatable), then the systems: website, CRM, outreach, automation. Hyper Racer USA is
  the prototype. Plain words for non-technical owners; no AI-speak. Not a marketing agency.

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
    The page shows whichever matches the visitor's device, so the type stays legible on both.
    A phone-first app (DispatchRelay) has only the phone view and shows as a phone on every device. */
const screenSchema = z.object({ label: z.string(), note: z.string(), desk: shotSchema.optional(), phone: shotSchema });

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
  /** The phone menu button: all nav items live behind it below the sm breakpoint. */
  navMenu: z.object({ open: z.string(), close: z.string() }),
  hero: z.object({
    eyebrow: z.array(z.string()).min(1).max(5),
    title: z.string(),
    body: z.string(),
    primaryCta: linkSchema,
    secondaryCta: linkSchema,
    webglOffNotice: z.string(),
    /** Small cue that the engine behind the hero can be dragged. Shown only when the 3D is running. */
    rotateHint: z.string(),
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
    /** The screen viewer's arrow labels (one frame, a list of screens, previous / next). */
    viewer: z.object({ previous: z.string(), next: z.string() }),
    /** Clock shown in the drawn iPhone status bar. Apple's keynote time, so it reads as a device, not a screenshot. */
    phoneClock: z.string(),
    /** Label over the side-scrolling strip of the other builds. */
    moreLabel: z.string(),
    featured: z.object({
      client: z.string(),
      title: z.string(),
      summary: z.string(),
      href: z.string().url(),
      /** Optional second button: a live, self-serve demo of the product. */
      demo: linkSchema.optional(),
      year: z.string().length(4),
      /** The hero collage plus Visit site is the public-site proof; visitors can open the site. */
      shots: z.object({ hero: shotSchema, phone: shotSchema }),
      agents: z.object({
        title: z.string(),
        body: z.string(),
        guarantees: z.array(z.string()).min(2).max(4),
      }),
      /** Real admin screens, captured on a local instance seeded with invented leads. Never production data. */
      crm: z.object({
        title: z.string(),
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
          /** Either a hero collage (desktop page with a phone over it) or a row of screens. */
          shots: z.object({ hero: shotSchema, phone: shotSchema }).optional(),
          screens: z.array(screenSchema).min(3).max(8).optional(),
        })
        .refine((entry) => entry.shots || entry.screens, { message: "a project needs shots or screens" }),
      )
      .min(1)
      .max(3),
  }),
  /** How an engagement runs: four stages in a row. Concise and visual, not a new chapter. */
  process: z.object({
    id: z.literal("process"),
    title: z.string(),
    intro: z.string(),
    steps: z.array(z.object({ id: z.string(), title: z.string(), body: z.string() })).length(4),
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
      placeholders: z.object({ name: z.string(), email: z.string(), launching: z.string(), budget: z.string() }),
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
      "Launch Control helps businesses find new customers, convert opportunities into revenue, and build the systems that make growth repeatable: market development, outreach, websites, CRM and automation.",
    url: "https://launch-control-flame.vercel.app",
    ogHeadline: "We build the whole engine. Then we launch it.",
  },
  nav: [
    { label: "Work", href: "#work" },
    { label: "What we do", href: "#build" },
    { label: "Team", href: "#team" },
    { label: "Book a launch", href: "#book" },
  ],
  navMenu: { open: "Menu", close: "Close" },
  hero: {
    eyebrow: ["Brand", "Website", "CRM", "Lead generation", "Outreach"],
    title: "We build the whole engine. Then we launch it.",
    body: "We help businesses find new customers, convert opportunities into revenue, and build the systems that make growth repeatable. From market development and outreach to websites, CRM and automation, we build the infrastructure and help put it to work.",
    primaryCta: { label: "Book a launch", href: "#book" },
    secondaryCta: { label: "See the work", href: "#work" },
    webglOffNotice: "3D is off on this device. The site works without it.",
    rotateHint: "Drag to rotate",
  },
  clients: {
    label: "Shipped for",
    items: [
      { name: "Hyper Racer USA", href: "https://www.hyperracerusa.com", mark: { src: "/clients/hyper-racer-v1.png", width: 73, height: 64 } },
      { name: "DispatchRelay", href: "https://dispatchrelay.co", mark: { src: "/clients/dispatchrelay-mark-v1.svg", width: 64, height: 64 } },
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
    intro: "Systems we built and now help run.",
    visitLabel: "Visit site",
    viewer: { previous: "Previous screen", next: "Next screen" },
    phoneClock: "9:41",
    moreLabel: "More builds",
    featured: {
      client: "Hyper Racer USA",
      title: "One system: website, CRM, pipeline and outreach, connected.",
      summary:
        "We helped establish Hyper Racer's U.S. commercial infrastructure, connecting its website, customer inquiries, dealer and partner development, and sales pipeline into one organized system. Beyond building the technology, we've supported outreach, qualification, follow-up, and U.S. market development.",
      href: "https://www.hyperracerusa.com",
      demo: { label: "Try the CRM", href: "https://demo.golaunchcontrol.com/admin/dashboard" },
      year: "2026",
      shots: {
        hero: { src: "/work/hyper-racer-home-desk-v3.webp", alt: "Hyper Racer USA home page: the X1 race car with its headline specs", width: 2560, height: 1600 },
        phone: { src: "/work/hyper-racer-home-phone-v3.webp", alt: "Hyper Racer USA home page on a phone", width: 1170, height: 2532 },
      },
      agents: {
        title: "Automation that works with your team, not around it.",
        body: "Our systems help organize customer information, research opportunities, prepare follow-ups, and keep the sales process moving. Automation handles repetitive tasks while your team stays in control of important decisions and customer relationships.",
        guarantees: [
          "Replies to customers are reviewed by a person before they go out.",
          "Automated actions remain visible and traceable.",
          "Lead changes and activity are logged so the team can see what happened and why.",
        ],
      },
      crm: {
        title: "Inside the CRM",
        screens: [
          {
            label: "Dashboard",
            note: "See who needs attention today, along with lead volume, active opportunities and pipeline value.",
            desk: { src: "/work/hyper-racer-crm-dashboard-desk-v3.webp", alt: "Hyper Racer command center dashboard: lead counts, pipeline value and the advisor's ranked list of who to contact", width: 2560, height: 1600 },
            phone: { src: "/work/hyper-racer-crm-dashboard-phone-v3.webp", alt: "The dashboard on a phone", width: 1170, height: 2532 },
          },
          {
            label: "Leads",
            note: "Every inquiry organized by source, type, priority and stage, with the next action and follow-up date set automatically from each email.",
            desk: { src: "/work/hyper-racer-crm-leads-desk-v4.webp", alt: "Leads list with product, type, organization, priority, next step and status for each lead", width: 2560, height: 1600 },
            phone: { src: "/work/hyper-racer-crm-leads-phone-v4.webp", alt: "The leads list on a phone", width: 1170, height: 2532 },
          },
          {
            label: "Pipeline",
            note: "Opportunities move through the pipeline on their own as emails, replies and meetings happen, from first inquiry through quote, deposit and sale, with value visible at each stage.",
            desk: { src: "/work/hyper-racer-crm-deals-desk-v3.webp", alt: "Sales pipeline board: deals by stage from inquiry to deposit with their values", width: 2560, height: 1600 },
            phone: { src: "/work/hyper-racer-crm-deals-phone-v3.webp", alt: "The pipeline on a phone", width: 1170, height: 2532 },
          },
        ],
      },
    },
    more: [
      {
        client: "DispatchRelay",
        title: "A freight marketplace for carriers, brokers, shippers and drivers.",
        summary:
          "Loads, bids, dispatch and live tracking on one platform, with a home screen for each role: carrier, broker, shipper and driver. Built as FreightX for a trucking company, now a product of its own.",
        href: "https://dispatchrelay.co",
        year: "2026",
        screens: [
          { label: "Sign in",
            note: "One app, four roles. Carrier, broker, shipper or driver, each with its own home screen.", phone: { src: "/work/dispatchrelay-login-phone-v4.webp", alt: "DispatchRelay sign-in: pick a role, carrier, broker, shipper or driver", width: 1290, height: 2796 } },
          { label: "Load board",
            note: "Open loads with bids and counters, what needs dispatch and what is already running.", phone: { src: "/work/dispatchrelay-loadboard-phone-v4.webp", alt: "Load board: bidding, needs dispatch and running loads with rates", width: 1290, height: 2796 } },
          { label: "Tracking",
            note: "A load number brings up the route on the map, the status and live GPS once the driver shares it.", phone: { src: "/work/dispatchrelay-track-phone-v4.webp", alt: "Tracking a shipment: load details and the route from Nashville to Chicago on a map", width: 1290, height: 2796 } },
          { label: "Hours",
            note: "Driving and on-duty time against the daily and weekly limits, with one-tap status changes.", phone: { src: "/work/dispatchrelay-hos-phone-v4.webp", alt: "Hours of service: driving, on-duty and weekly limits with status buttons", width: 1290, height: 2796 } },
        ],
      },
      {
        client: "Launch Control CRM",
        title: "The CRM behind the work, open as a live demo.",
        summary:
          "Leads, pipeline, follow-ups and email in one place, with the automation described above running inside it. Loaded with invented demo data so you can click through it yourself.",
        href: "https://demo.golaunchcontrol.com/admin/dashboard",
        year: "2026",
        shots: {
          hero: { src: "/work/hyper-racer-crm-dashboard-desk-v3.webp", alt: "The CRM dashboard: lead counts, pipeline value and a ranked list of who to contact", width: 2560, height: 1600 },
          phone: { src: "/work/hyper-racer-crm-dashboard-phone-v3.webp", alt: "The CRM dashboard on a phone", width: 1170, height: 2532 },
        },
      },
    ],
  },
  process: {
    id: "process",
    title: "How we work",
    intro: "Four stages, one team from the first conversation to the results.",
    steps: [
      { id: "discover", title: "Discover", body: "Understand the business, its customers, existing processes, and growth opportunities." },
      { id: "build", title: "Build", body: "Develop the website, CRM, pipeline, outreach processes, and other systems needed." },
      { id: "launch", title: "Launch", body: "Put the infrastructure into operation and begin executing the commercial strategy." },
      { id: "develop", title: "Develop", body: "Refine the process, track results, pursue opportunities, and support ongoing growth." },
    ],
  },
  build: {
    id: "build",
    title: "What we build and run",
    intro:
      "Not a marketing agency. We build the business development machine behind the company, then we operate it with you: find the market, find the people, contact them, track them, follow up.",
    services: [
      {
        id: "leads",
        title: "Lead generation",
        body: "We identify and qualify the customers, partners, and commercial opportunities that matter most to your business.",
      },
      {
        id: "outbound",
        title: "Outbound business development",
        body: "We initiate conversations, develop relationships, manage follow-up, and turn qualified interest into measurable business opportunities.",
      },
      {
        id: "crm",
        title: "CRM and sales infrastructure",
        body: "Custom-built systems that organize customer information, track opportunities, streamline follow-up, and give your team visibility across the entire sales process.",
      },
      {
        id: "positioning",
        title: "Positioning and messaging",
        body: "We clarify what makes your business valuable, who it serves, and how to communicate that value to the right audience.",
      },
      {
        id: "web",
        title: "Websites and digital presence",
        body: "Purpose-built websites and digital experiences designed to attract customers and connect directly to your commercial operations.",
      },
      {
        id: "growth",
        title: "Commercial growth strategy",
        body: "We identify opportunities, develop go-to-market plans, and build practical systems to support expansion into new customers, markets, and partnerships.",
      },
    ],
  },
  team: {
    id: "team",
    title: "Commercial expertise meets technical execution.",
    intro:
      "Launch Control combines hands-on business development with custom software and systems engineering. Strategy, execution, and technology are developed together rather than handed between disconnected teams.",
    people: [
      {
        name: "Maxwell Hartmann",
        role: "Co-Founder & Managing Director",
        body: "Leads business development, client acquisition, partnerships and market strategy. Owns the client relationship from the first conversation through every stage after.",
      },
      {
        name: "Eris Dothard",
        role: "Co-Founder & Technical Director",
        body: "Leads technical architecture, development, automation and system implementation. Builds the website, the CRM and the systems inside it, and keeps them running.",
      },
    ],
  },
  book: {
    id: "book",
    title: "Book a launch",
    body: "Tell us what you sell and who you need to reach. We reply within one working day.",
    afterNote: "We'll start with a short conversation to understand your business, identify opportunities, and see where we can add value.",
    fields: {
      name: "Name",
      email: "Email",
      launching: "What are you launching",
      budget: "Budget",
      budgetOptions: ["Under 10k", "10k to 30k", "Over 30k"],
      placeholders: {
        name: "Your name",
        email: "you@company.com",
        launching: "What you sell, who you need to reach, and where you are today",
        budget: "Select a range",
      },
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
    blurb: "We help businesses find new customers, convert opportunities into revenue, and build the systems that make growth repeatable.",
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
