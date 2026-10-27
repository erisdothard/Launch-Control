// Pure types/constants shared by server-only store modules (which touch
// fs/promises) and client components (which can't). Client components must
// import from here, never from leads.ts/customers.ts/activity.ts directly —
// those pull fs into the browser bundle and break the build.

// Statuses are set by the database from what happened (supabase/migrations/20261019000005):
// an email out, a reply in, a meeting booked, a deal's stage. Nobody picks them from a list.
// "nurture" (shown as "Gone quiet") is where a lead goes when every follow-up went unanswered: still
// worth a check-in now and then, but off the daily chase and never confused with "lost".
export type LeadStatus = "new" | "contacted" | "replied" | "meeting" | "proposal" | "negotiation" | "converted" | "lost" | "nurture";

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "replied",
  "meeting",
  "proposal",
  "negotiation",
  "converted",
  "lost",
  "nurture",
];

// Whose move it is: "us" after they write, "them" after we do. Null before any email.
export type Awaiting = "us" | "them";

// The three kinds of work, named the same on every page (Today, Inbox, Leads, Calendar, Tasks):
//   Replies needed  they wrote to us last and it's our move (lead awaiting "us").
//   Follow-ups due  nobody is waiting on us, and the lead's follow-up date has come (our chase after
//                   an unanswered email, or a date someone set by hand).
//   New inquiries   came in through the website form and nobody has written back yet.
// An unanswered email of ours is a follow-up, never a reply needed: nobody is waiting on us.
export const WORK_LABELS = {
  reply: "Replies needed",
  followup: "Follow-ups due",
  new: "New inquiries",
} as const;

// The leads page's views. Each one is a question the team asks, answered by columns the
// database keeps current, so nothing in them goes stale waiting for a click.
export const LEAD_VIEWS = [
  { key: "needs-reply", label: WORK_LABELS.reply, hint: "They wrote to you last. Your move." },
  { key: "follow-up", label: WORK_LABELS.followup, hint: "No answer yet (or a date you set), and the follow-up date has come." },
  { key: "new-inquiries", label: WORK_LABELS.new, hint: "Came in through the website and nobody has written back yet." },
  { key: "waiting", label: "Waiting on them", hint: "You wrote last. Nothing to do until the follow-up date." },
  { key: "in-play", label: "Meetings & deals", hint: "Meeting booked, proposal out, or negotiating." },
  { key: "quiet", label: "Gone quiet", hint: "Never answered any follow-up. Not lost: check in now and then." },
  { key: "not-contacted", label: "Not contacted", hint: "Nobody has emailed them yet." },
  { key: "closed", label: "Closed", hint: "Won, lost, or asked not to be contacted." },
  { key: "all", label: "All", hint: "Every lead." },
] as const;

export type LeadView = (typeof LEAD_VIEWS)[number]["key"];

const CLOSED: readonly LeadStatus[] = ["converted", "lost"];

// Source on leads created by the marketing site's booking form (src/app/api/inquiry/route.ts).
export const WEBSITE_LEAD_SOURCE = "Website";

/** A lead that came in by itself (the website form), as opposed to one we found. */
export function isInquiry(lead: Pick<Lead, "source">): boolean {
  const source = lead.source.trim().toLowerCase();
  return source === WEBSITE_LEAD_SOURCE.toLowerCase() || source === "inquiry";
}

// A website inquiry nobody has answered stays a new inquiry, whatever date is on it.
const freshInquiry = (lead: Lead) => isInquiry(lead) && lead.status === "new" && lead.lastContactedAt === null && lead.awaiting !== "us";

/**
 * Whether a lead belongs in a view. The ONE definition every count and list shares: the Leads
 * tabs, Today's queue, the Inbox's Replies needed, the Calendar and the Tasks summary.
 */
export function matchesView(lead: Lead, view: LeadView, today: string): boolean {
  const open = !CLOSED.includes(lead.status) && !lead.doNotContact;
  // Gone quiet is open (not lost) but off the daily chase.
  const active = open && lead.status !== "nurture";
  switch (view) {
    case "needs-reply":
      return open && lead.awaiting === "us";
    case "follow-up":
      // Our chase (they haven't answered) or a date someone set by hand: either way, not a reply.
      return active && !freshInquiry(lead) && lead.awaiting !== "us" && lead.followUpOn !== null && lead.followUpOn <= today;
    case "new-inquiries":
      return active && freshInquiry(lead);
    case "waiting":
      return active && lead.awaiting === "them" && (lead.followUpOn === null || lead.followUpOn > today);
    case "in-play":
      return open && (lead.status === "meeting" || lead.status === "proposal" || lead.status === "negotiation");
    case "quiet":
      return open && lead.status === "nurture" && lead.awaiting !== "us";
    case "not-contacted":
      return active && lead.status === "new" && lead.lastContactedAt === null;
    case "closed":
      return !open;
    case "all":
      return true;
  }
}

export interface WorkCounts {
  replies: number;
  followUps: number;
  inquiries: number;
}

/** The three work counts, from one list of leads. */
export function countWork(leads: Lead[], today: string): WorkCounts {
  let replies = 0;
  let followUps = 0;
  let inquiries = 0;
  for (const lead of leads) {
    if (matchesView(lead, "needs-reply", today)) replies += 1;
    else if (matchesView(lead, "follow-up", today)) followUps += 1;
    else if (matchesView(lead, "new-inquiries", today)) inquiries += 1;
  }
  return { replies, followUps, inquiries };
}

export function parseLeadView(value: string | undefined): LeadView {
  return LEAD_VIEWS.find((v) => v.key === value)?.key ?? "needs-reply";
}

export interface Lead {
  id: string;
  businessName: string;
  email: string;
  phone: string;
  status: LeadStatus;
  source: string;
  notes: string;
  createdAt: string;
  nextAction: string;
  followUpOn: string | null; // YYYY-MM-DD
  lastContactedAt: string | null; // set by the DB when the team emails the lead from the CRM
  lastReplyAt: string | null; // set by the DB when a reply from them is recorded
  statusReason: string; // why the status is what it is ("They replied", "Meeting Oct 21")
  statusChangedAt: string | null;
  awaiting: Awaiting | null;
  doNotContact: boolean;
  followUpCount: number;
  prospect: Prospect | null;
}

// One of Max's 11 scoring factors, rated 0-5 by the lead-gen scorer with the
// evidence it used. Keys are stable snake_case ids (tools/leadgen/config.yaml).
export interface ScoreFactor {
  rating: number;
  evidence: string;
}

// Fields the lead-gen pipeline (tools/leadgen) writes. Null on leads that were
// entered by hand, so the UI can tell the two apart without guessing.
export interface Prospect {
  segment: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  domain: string | null;
  contactName: string | null;
  contactTitle: string | null;
  score: number | null;
  scoreBreakdown: Record<string, ScoreFactor> | null;
  scoreReason: string | null;
  outreachHook: string | null;
  signals: Record<string, unknown> | null;
  runId: string | null;
  scoredAt: string | null;
}

// The literal `source` value the lead-gen pipeline (tools/leadgen/store.py) writes on
// every lead it creates. Manual/form leads never get this value automatically, so it's
// the one thing that reliably tells "automated lead-gen" leads apart from everything
// else in the `source` free-text field. Keep in sync with store.py.
export const AUTOMATED_LEAD_SOURCE = "lead-gen";

export interface Customer {
  id: string;
  businessName: string;
  email: string;
  phone: string;
  notes: string;
  fromLeadId: string | null;
  createdAt: string;
}

// Stages match StatusBadge's existing "deal" variant color map.
export type DealStage = "inquiry" | "proposal" | "negotiation" | "won" | "lost";

export const DEAL_STAGES: DealStage[] = ["inquiry", "proposal", "negotiation", "won", "lost"];

export interface Deal {
  id: string;
  businessName: string;
  value: number;
  stage: DealStage;
  notes: string;
  fromLeadId: string | null;
  createdAt: string;
}

export type TaskRelatedType = "lead" | "deal";

export interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  done: boolean;
  relatedType: TaskRelatedType | null;
  relatedId: string | null;
  relatedLabel: string | null;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  entityType: "lead" | "customer" | "deal" | "task";
  entityId: string;
  entityLabel: string;
  action: "created" | "updated" | "status_changed" | "converted" | "deleted";
  detail?: string;
  createdAt: string;
}

export type LeadGenRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface LeadGenRun {
  id: string;
  status: LeadGenRunStatus;
  startedAt: string;
  finishedAt: string | null;
  found: number;
  enriched: number;
  kept: number;
  excluded: number;
  error: string | null;
  stage: string | null;
  params: LeadGenParams;
  requestedBy: string | null;
}

// What the CRM asks the worker for (tools/leadgen/leadgen/worker.py validates it again).
export interface LeadGenParams {
  states?: string[];
  segments?: string[];
  max_queries?: number;
  limit?: number;
  size?: string;
  require?: ("email" | "phone")[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string; // ISO timestamp
  endsAt: string;
  allDay: boolean;
  location: string;
  notes: string;
  leadId: string | null;
  createdBy: string;
  createdAt: string;
  outlookEventId: string | null;
  /** Set on events read from the Outlook calendar (not created in the CRM): open them in Outlook. */
  outlookLink?: string | null;
}
