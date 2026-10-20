// What needs a person today. The Today page renders it; the nav shows the count. Both count the
// same queue (`queueFor`), so the badge never disagrees with the page.
import { getLeads } from "@/lib/store/leads";
import { getPendingDrafts } from "@/lib/store/drafts";
import { getInbox } from "@/lib/store/messages";
import { emailConfig } from "@/lib/email/config";
import { teamTodayISO } from "@/lib/leads/followUp";
import { attentionOf, queueFor } from "./data";

/** Replies owed + follow-ups due + new website inquiries + drafts waiting, each lead counted once. */
export async function getAttentionCount(): Promise<number> {
  const today = teamTodayISO(new Date(), emailConfig.teamTimeZone);
  const [leads, inbox, drafts] = await Promise.all([getLeads(), getInbox(), getPendingDrafts()]);
  return attentionOf(queueFor(leads, inbox, drafts, today));
}
