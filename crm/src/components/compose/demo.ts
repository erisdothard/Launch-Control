// Invented people and companies for ?demo=1 (development only): lets every composer step and the
// campaign pages be looked at and screenshotted without reading or writing Max's live data.
import type { AudienceLead } from "./audience";
import type { ComposerAccount, ComposerTemplate } from "./types";
import { countRecipients, type CampaignDetail, type CampaignRecipient, type CampaignSummary } from "@/lib/store/campaigns";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

function lead(
  id: number,
  contactName: string,
  businessName: string,
  email: string,
  extra: Partial<AudienceLead> = {}
): AudienceLead {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    businessName,
    email,
    contactName,
    title: "",
    city: "Nashville",
    state: "TN",
    website: "",
    phone: "",
    status: "new",
    source: "lead-gen",
    doNotContact: false,
    lastContactedAt: null,
    views: ["not-contacted"],
    ...extra,
  };
}

export const DEMO_LEADS: AudienceLead[] = [
  lead(1, "Dana Reyes", "Ridge Motorsport", "dana@ridgemotorsport.com", { title: "Head of Events", status: "replied", views: ["needs-reply"], lastContactedAt: ago(2), source: "Website" }),
  lead(2, "Kevin Osei", "Apex Track Days", "kevin@apextrackdays.com", { title: "Owner", status: "meeting", views: ["in-play"], lastContactedAt: ago(4), city: "Franklin" }),
  lead(3, "Sofia Laurent", "Coastline Karting", "sofia@coastlinekarting.com", { title: "General Manager", status: "contacted", views: ["follow-up"], lastContactedAt: ago(5), city: "Miami", state: "FL" }),
  lead(4, "Marcus Bell", "Bell Race Prep", "marcus@bellraceprep.com", { status: "contacted", views: ["waiting"], lastContactedAt: ago(20) }),
  lead(5, "Jen Takahashi", "Summit Driving Club", "jen@summitdriving.club", { source: "Website" }),
  lead(6, "", "Harbor Point Marina", "info@harborpointmarina.com", { city: "Fort Lauderdale", state: "FL" }),
  lead(7, "Owen Park", "Crescent Auto Spa", "owen@crescentautospa.com"),
  lead(8, "Priya Nair", "Northline Logistics", "priya@northlinelogistics.com", { city: "Memphis" }),
  lead(9, "Luis Ortega", "Ortega Roofing", "luis@ortegaroofing.com", { city: "Murfreesboro" }),
  lead(10, "Grace Whitfield", "Whitfield Dental Studio", "", { city: "Brentwood" }),
  lead(11, "Tom Becker", "Becker HVAC", "tom@beckerhvac.com", { doNotContact: true, status: "lost", views: ["closed"] }),
  lead(12, "Amara Cole", "Cole & Co. Interiors", "amara@coleinteriors.com", { city: "Miami", state: "FL" }),
  lead(13, "Ben Hollis", "Hollis Fitness", "ben@hollisfitness.com", { lastContactedAt: ago(3), status: "contacted", views: ["waiting"] }),
  lead(14, "Rachel Kim", "Brightside Pediatrics", "rachel@brightsidepeds.com"),
  lead(15, "", "Gulf Coast Charters", "hello@gulfcoastcharters.com", { city: "Naples", state: "FL" }),
];

export const DEMO_SUPPRESSED = ["hello@gulfcoastcharters.com"];

export const DEMO_ACCOUNTS: ComposerAccount[] = [
  {
    id: "demo-account",
    address: "maxwell@golaunchcontrol.com",
    displayName: "Launch Control",
    provider: "outlook",
    signatureName: "Maxwell Hartmann",
    signatureTitle: "Co-Founder / Managing Director",
    signaturePhone: "646-942-0682",
    status: "active",
    mailbox: null,
  },
  {
    id: "demo-account-eris",
    address: "eris@golaunchcontrol.com",
    displayName: "Launch Control",
    provider: "outlook",
    signatureName: "Eris Dothard",
    signatureTitle: "Systems and development",
    signaturePhone: "",
    status: "active",
    mailbox: "maxwell@golaunchcontrol.com",
  },
];

export const DEMO_TEMPLATES: ComposerTemplate[] = [
  {
    id: "demo-template-1",
    name: "First touch, local business",
    subject: "A quick idea for {{company}}",
    bodyText:
      "Hi {{first_name|there}},\n\nI run business development at Launch Control. We build the system behind a business: website, CRM, and the outreach that fills it.\n\nI had a look at {{company}} and think there's a simple win in how new customers find you in {{city|your area}}. Would a 15-minute call next week be useful?\n\nThanks,\nMax",
  },
  {
    id: "demo-template-2",
    name: "Check-in after a meeting",
    subject: "Following up, {{first_name}}",
    bodyText: "Hi {{first_name|there}},\n\nGood to talk. I've put the next steps together and can send them over whenever suits.\n\nMax",
  },
];

function recipient(i: number, l: AudienceLead, patch: Partial<CampaignRecipient>): CampaignRecipient {
  return {
    id: `demo-r-${i}`,
    email: l.email || `person${i}@example.com`,
    leadId: l.id,
    merge: { first_name: l.contactName.split(" ")[0] ?? "", company: l.businessName, full_name: l.contactName },
    subjectOverride: null,
    bodyOverride: null,
    status: "sent",
    skipReason: null,
    error: null,
    step: 1,
    sentAt: ago(3),
    repliedAt: null,
    followUpSentAt: null,
    ...patch,
  };
}

const sentRecipients: CampaignRecipient[] = DEMO_LEADS.filter((l) => l.email).map((l, i) =>
  recipient(i, l, {
    repliedAt: i % 4 === 1 && !l.doNotContact && i !== 6 ? ago(2) : null,
    followUpSentAt: i % 4 === 2 && !l.doNotContact && i !== 6 ? ago(0.5) : null,
    step: i % 4 === 2 && !l.doNotContact && i !== 6 ? 2 : 1,
    status: l.doNotContact ? "skipped" : i === 6 ? "failed" : "sent",
    skipReason: l.doNotContact ? "Asked not to be contacted" : null,
    error: i === 6 ? "550 5.1.1 Recipient address rejected: mailbox unavailable" : null,
    sentAt: l.doNotContact || i === 6 ? null : ago(3),
  })
);

const sendingRecipients: CampaignRecipient[] = DEMO_LEADS.filter((l) => l.email).map((l, i) =>
  recipient(100 + i, l, i < 5 ? { sentAt: ago(0.01) } : { status: "pending", sentAt: null })
);

function summary(id: string, patch: Partial<CampaignSummary>, rows: CampaignRecipient[]): CampaignSummary {
  return {
    id,
    name: "",
    subject: "",
    status: "sent",
    accountId: "demo-account",
    fromAddress: "maxwell@golaunchcontrol.com",
    scheduledAt: null,
    startedAt: null,
    finishedAt: null,
    createdAt: ago(4),
    createdBy: "maxwell@golaunchcontrol.com",
    perMinute: 10,
    followUpAfterDays: null,
    counts: countRecipients(rows),
    ...patch,
  };
}

const DETAIL_BODY = DEMO_TEMPLATES[0].bodyText;

export const DEMO_CAMPAIGNS: CampaignDetail[] = [
  {
    ...summary("demo-sending", { name: "Spring track-day operators", subject: "Spring bookings for {{company}}", status: "sending", startedAt: ago(0.02), createdAt: ago(0.03), followUpAfterDays: 4 }, sendingRecipients),
    bodyText: DETAIL_BODY,
    includeSignature: true,
    attachments: [{ name: "Launch Control overview.pdf", path: "campaigns/demo/overview.pdf", size: 1_240_000, type: "application/pdf" }],
    skipContactedDays: 14,
    followUpSubject: null,
    followUpBody: "Hi {{first_name|there}}, just bringing this back to the top of your inbox. Worth a quick call?\n\nMax",
    recipients: sendingRecipients,
  },
  {
    ...summary("demo-scheduled", { name: "Miami service businesses", subject: "A quick idea for {{company}}", status: "scheduled", scheduledAt: new Date(Date.now() + 2 * DAY).toISOString(), createdAt: ago(1) }, sendingRecipients.map((r) => ({ ...r, status: "pending" as const, sentAt: null }))),
    bodyText: DETAIL_BODY,
    includeSignature: true,
    attachments: [],
    skipContactedDays: 0,
    followUpSubject: null,
    followUpBody: null,
    recipients: sendingRecipients.map((r) => ({ ...r, status: "pending" as const, sentAt: null })),
  },
  {
    ...summary("demo-sent", { name: "October intro, Nashville", subject: "A quick idea for {{company}}", status: "sent", startedAt: ago(3), finishedAt: ago(2.9), createdAt: ago(3.1), followUpAfterDays: 3 }, sentRecipients),
    bodyText: DETAIL_BODY,
    includeSignature: true,
    attachments: [],
    skipContactedDays: 30,
    followUpSubject: null,
    followUpBody: "Hi {{first_name|there}}, following up on my note last week. Happy to send a short example of what we'd build for {{company}}.\n\nMax",
    recipients: sentRecipients,
  },
  {
    ...summary("demo-draft", { name: "Dentists, Brentwood", subject: "Patients finding {{company}}", status: "draft", createdAt: ago(6) }, []),
    bodyText: "Hi {{first_name|there}},\n\n",
    includeSignature: true,
    attachments: [],
    skipContactedDays: 0,
    followUpSubject: null,
    followUpBody: null,
    recipients: [],
  },
];
