// Pure types/constants shared by server-only store modules (which touch
// fs/promises) and client components (which can't). Client components must
// import from here, never from leads.ts/customers.ts/activity.ts directly —
// those pull fs into the browser bundle and break the build.

// Statuses are set by the database from what happened (supabase/migrations/20261019000005):
// an email out, a reply in, a meeting booked, a deal's stage. Nobody picks them from a list.
export type LeadStatus = "new" | "contacted" | "replied" | "meeting" | "proposal" | "negotiation" | "converted" | "lost";

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "replied",
  "meeting",
  "proposal",
  "negotiation",
  "converted",
  "lost",
];

// Whose move it is: "us" after they write, "them" after we do. Null before any email.
export type Awaiting = "us" | "them";

// The leads page's views. Each one is a question the team asks, answered by columns the
// database keeps current, so nothing in them goes stale waiting for a click.
export const LEAD_VIEWS = [
  { key: "needs-reply", label: "Needs reply", hint: "They wrote back. Your move." },
  { key: "follow-up", label: "Follow-up due", hint: "No answer yet and the next nudge is due." },
  { key: "waiting", label: "Waiting on them", hint: "You wrote last. Nothing to do yet." },
  { key: "in-play", label: "Meetings & deals", hint: "Meeting booked, proposal out, or negotiating." },
  { key: "not-contacted", label: "Not contacted", hint: "Nobody has emailed them yet." },
  { key: "closed", label: "Closed", hint: "Won, lost, or asked not to be contacted." },
  { key: "all", label: "All", hint: "Every lead." },
] as const;

export type LeadView = (typeof LEAD_VIEWS)[number]["key"];

const CLOSED: readonly LeadStatus[] = ["converted", "lost"];

/** Whether a lead belongs in a view. The one definition the list and the tab counts share. */
export function matchesView(lead: Lead, view: LeadView, today: string): boolean {
  const open = !CLOSED.includes(lead.status) && !lead.doNotContact;
  switch (view) {
    case "needs-reply":
      return open && lead.awaiting === "us";
    case "follow-up":
      return open && lead.awaiting === "them" && lead.followUpOn !== null && lead.followUpOn <= today;
    case "waiting":
      return open && lead.awaiting === "them" && (lead.followUpOn === null || lead.followUpOn > today);
    case "in-play":
      return open && (lead.status === "meeting" || lead.status === "proposal" || lead.status === "negotiation");
    case "not-contacted":
      return open && lead.status === "new" && lead.lastContactedAt === null;
    case "closed":
      return !open;
    case "all":
      return true;
  }
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

// Source on leads created by the marketing site's booking form (src/app/api/inquiry/route.ts).
export const WEBSITE_LEAD_SOURCE = "Website";

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
