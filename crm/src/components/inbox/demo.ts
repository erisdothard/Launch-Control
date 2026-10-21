import type { EmailDraft } from "@/lib/store/drafts";
import type { EmailAccount, EmailMessage, InboxCounts, InboxFolder, ThreadLead, ThreadSummary } from "@/lib/store/messages";

// Invented people and businesses for ?demo=1 (development only): screenshots and design review
// without opening, marking or touching Max's real mail.

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

export const DEMO_ACCOUNTS: EmailAccount[] = [
  {
    id: "demo-acc",
    provider: "outlook",
    address: "maxwell@golaunchcontrol.com",
    displayName: "Launch Control",
    signatureName: "Maxwell Hartmann",
    signatureTitle: "Co-Founder / Managing Director",
    signaturePhone: "646-942-0682",
    connectedBy: "demo",
    status: "active",
    mailbox: null,
    lastError: null,
    lastErrorAt: null,
  },
  {
    id: "demo-acc-2",
    provider: "outlook",
    address: "eris@golaunchcontrol.com",
    displayName: "Launch Control",
    signatureName: "Eris Dothard",
    signatureTitle: "Systems and development",
    signaturePhone: "",
    connectedBy: "demo",
    status: "active",
    mailbox: "maxwell@golaunchcontrol.com",
    lastError: null,
    lastErrorAt: null,
  },
];

const msg = (m: Partial<EmailMessage> & Pick<EmailMessage, "id" | "direction" | "fromAddress" | "toAddress" | "subject" | "bodyText" | "createdAt">): EmailMessage => ({
  leadId: null,
  accountId: "demo-acc",
  folder: m.direction === "in" ? "inbox" : "sent",
  conversationId: null,
  fromName: "",
  ccAddress: "",
  attachments: [],
  provider: "outlook",
  status: m.direction === "in" ? "received" : "sent",
  error: null,
  sentBy: m.direction === "out" ? "maxwell@golaunchcontrol.com" : null,
  readAt: ago(1),
  ...m,
});

const CONVERSATIONS: Record<string, EmailMessage[]> = {
  "demo-dana": [
    msg({
      id: "d1",
      leadId: "demo-lead-dana",
      direction: "out",
      fromAddress: "maxwell@golaunchcontrol.com",
      fromName: "Launch Control",
      toAddress: "dana@ridgemotorsport.com",
      subject: "Ridge Motorsport: the site and CRM we talked about",
      bodyText:
        "Hi Dana,\n\nGood to meet you at the paddock on Saturday. As promised, here is the outline for the new site, the booking flow and the CRM that runs behind it.\n\nThe proposal is attached. It covers two cars on the track-day packages, with the March opener as the go-live date.\n\nMax",
      createdAt: ago(52),
      attachments: [{ name: "Ridge Motorsport proposal.pdf", size: 1_840_000, type: "application/pdf", path: "demo" }],
    }),
    msg({
      id: "d2",
      leadId: "demo-lead-dana",
      direction: "in",
      fromAddress: "dana@ridgemotorsport.com",
      fromName: "Dana Reyes",
      toAddress: "maxwell@golaunchcontrol.com",
      ccAddress: "ops@ridgemotorsport.com",
      subject: "Re: Ridge Motorsport: the site and CRM we talked about",
      bodyText:
        "Max,\n\nLooks great. Can you price it for three cars, not two? We'd want it live before the March opener.\n\nI've attached last season's booking numbers so you can see the volume.\n\nDana Reyes\nHead of Events, Ridge Motorsport",
      createdAt: ago(19),
      readAt: null,
      attachments: [{ name: "2026 bookings.xlsx", size: 48_200, type: "application/vnd.ms-excel", providerId: "demo" }],
    }),
  ],
  "demo-supplier": [
    msg({
      id: "s1",
      direction: "in",
      fromAddress: "billing@trackprint.co",
      fromName: "TrackPrint Billing",
      toAddress: "maxwell@golaunchcontrol.com",
      subject: "Invoice 2291 for the banner order",
      bodyText: "Hi Maxwell,\n\nYour invoice for the paddock banners is attached. Payment is due in 30 days.\n\nThanks,\nTrackPrint",
      createdAt: ago(5),
      attachments: [{ name: "Invoice-2291.pdf", size: 96_000, type: "application/pdf", providerId: "demo" }],
    }),
  ],
};

const LEADS: Record<string, ThreadLead> = {
  "demo-lead-dana": { id: "demo-lead-dana", businessName: "Ridge Motorsport", contactName: "Dana Reyes", email: "dana@ridgemotorsport.com", status: "replied" },
};

const THREADS: ThreadSummary[] = [
  {
    key: "demo-supplier",
    leadId: null,
    businessName: null,
    contactName: null,
    name: "TrackPrint Billing",
    address: "billing@trackprint.co",
    subject: "Invoice 2291 for the banner order",
    snippet: "Hi Maxwell, your invoice for the paddock banners is attached. Payment is due in 30 days.",
    lastAt: ago(5),
    lastDirection: "in",
    unread: 1,
    count: 1,
    hasAttachments: true,
  },
  {
    key: "demo-kevin",
    leadId: "demo-lead-kevin",
    businessName: "Apex Track Days",
    contactName: "Kevin Osei",
    name: "Kevin Osei",
    address: "kevin@apextrackdays.com",
    subject: "Re: Today's call",
    snippet: "Confirmed for 1:00. Should I bring our marketing lead, or keep it to the two of us for now?",
    lastAt: ago(8),
    lastDirection: "in",
    unread: 1,
    count: 4,
    hasAttachments: false,
  },
  {
    key: "demo-dana",
    leadId: "demo-lead-dana",
    businessName: "Ridge Motorsport",
    contactName: "Dana Reyes",
    name: "Dana Reyes",
    address: "dana@ridgemotorsport.com",
    subject: "Re: Ridge Motorsport: the site and CRM we talked about",
    snippet: "Looks great. Can you price it for three cars, not two? We'd want it live before the March opener.",
    lastAt: ago(19),
    lastDirection: "in",
    unread: 0,
    count: 2,
    hasAttachments: true,
  },
  {
    key: "demo-sofia",
    leadId: "demo-lead-sofia",
    businessName: "Coastline Karting",
    contactName: "Sofia Laurent",
    name: "Sofia Laurent",
    address: "sofia@coastlinekarting.com",
    subject: "Re: Booking page for the summer league",
    snippet: "You: Here's the revised proposal with the league sign-up added. Happy to walk through it on Friday.",
    lastAt: ago(30),
    lastDirection: "out",
    unread: 0,
    count: 5,
    hasAttachments: false,
  },
  {
    key: "demo-news",
    leadId: null,
    businessName: null,
    contactName: null,
    name: "Motorsport Business Weekly",
    address: "news@msbweekly.com",
    subject: "Track-day bookings are up 18% this season",
    snippet: "This week: what the busiest circuits changed in their booking pages, and why waitlists sell out faster.",
    lastAt: ago(44),
    lastDirection: "in",
    unread: 0,
    count: 1,
    hasAttachments: false,
  },
  {
    key: "demo-paul",
    leadId: "demo-lead-paul",
    businessName: "Sebring Race Prep",
    contactName: "Paul Duarte",
    name: "Paul Duarte",
    address: "paul@sebringraceprep.com",
    subject: "Re: Quick question about your shop's website",
    snippet: "Tuesday works. Send me a calendar invite for the morning and I'll have the numbers ready.",
    lastAt: ago(70),
    lastDirection: "in",
    unread: 0,
    count: 3,
    hasAttachments: false,
  },
];

export const DEMO_COUNTS: InboxCounts = { unread: 2, needsReply: 3 };

export function demoThreads(folder: InboxFolder): ThreadSummary[] {
  if (folder === "needs") return THREADS.filter((t) => t.lastDirection === "in" && (t.unread || t.leadId));
  if (folder === "sent") return THREADS.filter((t) => t.count > 1);
  if (folder === "archive") return THREADS.slice(4);
  return THREADS;
}

export function demoConversation(key: string): EmailMessage[] {
  return CONVERSATIONS[key] ?? CONVERSATIONS["demo-dana"];
}

export function demoLead(id: string | null): ThreadLead | null {
  return id ? (LEADS[id] ?? null) : null;
}

export const DEMO_DRAFTS: EmailDraft[] = [
  {
    id: "demo-draft-1",
    leadId: "demo-lead-dana",
    businessName: "Ridge Motorsport",
    contactName: "Dana Reyes",
    kind: "reply",
    followUpNumber: null,
    to: "dana@ridgemotorsport.com",
    subject: "Re: Ridge Motorsport: the site and CRM we talked about",
    body: "Hi Dana,\n\nThree cars works. The package moves to $48,000 and still goes live before the March opener. I've updated the proposal and we can walk through it Thursday.\n\nMax",
    createdAt: ago(18),
    error: null,
    replyToMessageId: "d2",
    replyingTo: { subject: "Re: Ridge Motorsport", body: "Looks great. Can you price it for three cars, not two? We'd want it live before the March opener.", at: ago(19) },
  },
  {
    id: "demo-draft-2",
    leadId: "demo-lead-sofia",
    businessName: "Coastline Karting",
    contactName: "Sofia Laurent",
    kind: "follow_up",
    followUpNumber: 2,
    to: "sofia@coastlinekarting.com",
    subject: "Re: Booking page for the summer league",
    body: "Hi Sofia,\n\nOne more thought: the league sign-up can take deposits, so the waitlist turns into paid spots before the season starts.\n\nIf it's not a fit, just say so and I won't follow up again.\n\nMax",
    createdAt: ago(3),
    error: null,
    replyToMessageId: null,
    replyingTo: null,
  },
];
