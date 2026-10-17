// Pure computation — no fs, safe to import from server or client components.
// This is the single place that defines what "leads generated this month"
// means, so the dashboard stat and the monthly digest email never disagree.

import { AUTOMATED_LEAD_SOURCE, type Lead } from "@/lib/store/types";

export function isAutomatedLead(lead: Lead): boolean {
  return lead.source === AUTOMATED_LEAD_SOURCE;
}

export interface LeadGenMonthStats {
  /** Automated-source leads created within the current calendar month, through `now`. */
  count: number;
  /** Human label for the window, e.g. "August 2026". */
  monthLabel: string;
  periodStart: string;
  periodEnd: string;
}

// Calendar-month window (1st of the month through `now`), not a rolling 30
// days — matches what "this month" means when a client reads it on a
// dashboard or in an email subject line.
export function getLeadsGeneratedThisMonth(leads: Lead[], now: Date = new Date()): LeadGenMonthStats {
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  const count = leads.filter((lead) => {
    if (!isAutomatedLead(lead)) return false;
    const createdAt = new Date(lead.createdAt);
    return createdAt >= periodStart && createdAt <= now;
  }).length;

  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return {
    count,
    monthLabel,
    periodStart: periodStart.toISOString(),
    periodEnd: now.toISOString(),
  };
}
