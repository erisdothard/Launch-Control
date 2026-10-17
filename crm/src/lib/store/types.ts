// Pure types/constants shared by server-only store modules (which touch
// fs/promises) and client components (which can't). Client components must
// import from here, never from leads.ts/customers.ts/activity.ts directly —
// those pull fs into the browser bundle and break the build.

export type LeadStatus = "new" | "contacted" | "qualified" | "proposal" | "negotiation" | "converted" | "lost";

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "converted",
  "lost",
];

export interface Lead {
  id: string;
  businessName: string;
  email: string;
  phone: string;
  status: LeadStatus;
  source: string;
  notes: string;
  createdAt: string;
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

export type LeadGenRunStatus = "running" | "completed" | "failed";

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
}
