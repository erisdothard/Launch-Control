// Who a mass email goes to. Pure, shared by the composer (live, in the browser) and the save action
// (again on the server with fresh data, so the browser is never trusted with who gets excluded).
import { completeValues, type MergeValues } from "@/lib/email/merge";
import type { LeadStatus, LeadView } from "@/lib/store/types";

/** The slice of a lead the composer needs: enough to pick, merge and exclude. */
export interface AudienceLead {
  id: string;
  businessName: string;
  email: string;
  contactName: string;
  title: string;
  city: string;
  state: string;
  website: string;
  phone: string;
  status: LeadStatus;
  source: string;
  doNotContact: boolean;
  lastContactedAt: string | null;
  views: LeadView[];
}

/** Someone added to the list, before exclusions. */
export interface Candidate {
  email: string;
  leadId: string | null;
  values: MergeValues;
  /** How they got on the list, in words: "Needs reply view", "Pasted list". */
  origin: string;
}

export type ExcludeReason = "do_not_contact" | "suppressed" | "missing_email" | "invalid" | "duplicate" | "recent";

export const EXCLUDE_LABELS: Record<ExcludeReason, { title: string; why: string; overridable: boolean }> = {
  do_not_contact: { title: "Asked not to be contacted", why: "These leads are marked do not contact.", overridable: false },
  suppressed: { title: "Unsubscribed or bounced", why: "These addresses opted out or bounced before.", overridable: false },
  missing_email: { title: "No email address", why: "Add an address on their record to include them.", overridable: false },
  invalid: { title: "Address doesn't look right", why: "These can't be delivered as written.", overridable: false },
  duplicate: { title: "Already on the list", why: "Each address gets one email.", overridable: false },
  recent: { title: "Emailed recently", why: "Skipped by your recent-contact rule. Include anyone you still want to reach.", overridable: true },
};

export interface Recipient extends Candidate {
  /** Stable id for React and overrides: the address, or lead:<id> when there is none. */
  key: string;
  excluded: ExcludeReason | null;
  /** Shown beside an exclusion: "Emailed Oct 18". */
  detail: string;
  /** Max chose to include someone the recent-contact rule left out. */
  overridden: boolean;
}

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$/i;

export function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export function leadValues(lead: AudienceLead): MergeValues {
  return completeValues({
    full_name: lead.contactName,
    company: lead.businessName,
    email: lead.email,
    city: lead.city,
    state: lead.state,
    website: lead.website.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, ""),
    phone: lead.phone,
    title: lead.title,
  });
}

export function leadCandidate(lead: AudienceLead, origin: string): Candidate {
  return { email: lead.email.trim().toLowerCase(), leadId: lead.id, values: leadValues(lead), origin };
}

export interface AudienceContext {
  leadsById: Map<string, AudienceLead>;
  leadsByEmail: Map<string, AudienceLead>;
  suppressed: Set<string>;
  /** Skip anyone emailed in the last N days (0 = off). */
  skipDays: number;
  /** Keys Max included despite the recent-contact rule. */
  overrides: Set<string>;
  now: number;
}

export function buildContext(
  leads: AudienceLead[],
  suppressed: Iterable<string>,
  skipDays: number,
  overrides: Iterable<string>,
  now = Date.now()
): AudienceContext {
  const leadsByEmail = new Map<string, AudienceLead>();
  for (const l of leads) if (l.email.trim()) leadsByEmail.set(l.email.trim().toLowerCase(), l);
  return {
    leadsById: new Map(leads.map((l) => [l.id, l])),
    leadsByEmail,
    suppressed: new Set([...suppressed].map((e) => e.toLowerCase())),
    skipDays,
    overrides: new Set(overrides),
    now,
  };
}

const DAY_MS = 86_400_000;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
}

/**
 * Dedupe by address and apply the exclusions. A pasted address that matches a lead is linked to
 * that lead, so their do-not-contact flag and last contact count, and their record gets the email.
 * Values typed or pasted win over the lead's own (a list may carry a better first name).
 */
export function evaluateAudience(candidates: Candidate[], ctx: AudienceContext): { included: Recipient[]; excluded: Recipient[] } {
  const included: Recipient[] = [];
  const excluded: Recipient[] = [];
  const seen = new Set<string>();

  candidates.forEach((c, index) => {
    const email = c.email.trim().toLowerCase();
    const lead = (c.leadId ? ctx.leadsById.get(c.leadId) : undefined) ?? (email ? ctx.leadsByEmail.get(email) : undefined);
    const values = lead ? { ...leadValues(lead), ...c.values } : c.values;
    const base = { ...c, email, leadId: lead?.id ?? c.leadId, values: completeValues({ ...values, email }) };
    const key = email || `lead:${c.leadId ?? `row-${index}`}`;
    const push = (excludedFor: ExcludeReason | null, detail = "", overridden = false) =>
      (excludedFor ? excluded : included).push({ ...base, key, excluded: excludedFor, detail, overridden });

    if (!email) {
      push("missing_email", lead ? lead.businessName : "");
      return;
    }
    if (seen.has(email)) {
      // Only the first copy counts; later ones are listed once so Max knows they were merged.
      if (!excluded.some((r) => r.key === key && r.excluded === "duplicate")) push("duplicate", c.origin);
      return;
    }
    seen.add(email);
    if (!isValidEmail(email)) push("invalid");
    else if (lead?.doNotContact) push("do_not_contact");
    else if (ctx.suppressed.has(email)) push("suppressed");
    else if (
      ctx.skipDays > 0 &&
      lead?.lastContactedAt &&
      ctx.now - new Date(lead.lastContactedAt).getTime() < ctx.skipDays * DAY_MS
    ) {
      const detail = `Emailed ${shortDate(lead.lastContactedAt)}`;
      if (ctx.overrides.has(key)) push(null, detail, true);
      else push("recent", detail);
    } else push(null);
  });
  return { included, excluded };
}

/** Display name for a recipient row: the person, else the company, else the address. */
export function recipientName(r: { values: MergeValues; email: string }): string {
  return r.values.full_name || r.values.company || r.email;
}

export function initials(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
