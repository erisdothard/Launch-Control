// Which leads are "untouched prospects": found by Lead Gen, never opened or emailed. The Leads
// page hides them by default so Max's list is people he is actually working; Lead Gen shows them.
import { AUTOMATED_LEAD_SOURCE, type Lead } from "@/lib/store/types";

export function isUntouchedProspect(lead: Lead): boolean {
  return lead.source === AUTOMATED_LEAD_SOURCE && lead.status === "new" && lead.lastContactedAt === null;
}
