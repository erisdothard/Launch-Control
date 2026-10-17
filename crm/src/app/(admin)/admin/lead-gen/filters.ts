import { LEAD_STATUSES, type LeadStatus } from "@/lib/store/types";

export interface LeadGenFilters {
  segment?: string;
  state?: string;
  minScore?: number;
  status?: LeadStatus;
}

// Shared by the page and the CSV export so both always show the same rows.
export function parseLeadGenFilters(params: Record<string, string | undefined>): LeadGenFilters {
  const min = Number(params.min);
  const status = LEAD_STATUSES.find((s) => s === params.status);
  return {
    segment: params.segment || undefined,
    state: params.state || undefined,
    minScore: Number.isFinite(min) && min > 0 ? Math.min(min, 100) : undefined,
    status,
  };
}
