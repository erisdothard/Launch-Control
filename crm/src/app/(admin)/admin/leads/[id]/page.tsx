import { notFound } from "next/navigation";
import { getLeadById } from "@/lib/store/leads";
import { getDealsForLead } from "@/lib/store/deals";
import { getActivityLog } from "@/lib/store/activity";
import LeadDetailClient from "./LeadDetailClient";
import MessagesPanel from "./MessagesPanel";
import { getEmailAccounts, getThread } from "@/lib/store/messages";
import { getUpcomingEventsForLead } from "@/lib/store/calendar";
import { teamTodayISO } from "@/lib/leads/followUp";
import { getPendingDrafts } from "@/lib/store/drafts";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLeadById(id);
  if (!lead) notFound();

  const [allActivity, messages, accounts, meetings, drafts, deals] = await Promise.all([
    getActivityLog(200),
    getThread(id),
    getEmailAccounts(),
    getUpcomingEventsForLead(id),
    getPendingDrafts(),
    getDealsForLead(id),
  ]);
  const draft = drafts.find((d) => d.leadId === id);
  const leadActivity = allActivity.filter((a) => a.entityType === "lead" && a.entityId === id);
  // The deal the hero shows: the newest one still alive, else the newest at all (a won/lost record).
  const deal = deals.find((d) => d.stage !== "lost") ?? deals[0] ?? null;
  const lastIn = [...messages].reverse().find((m) => m.direction === "in");

  return (
    <LeadDetailClient
      lead={lead}
      deal={deal}
      draft={draft ? { kind: draft.kind, followUpNumber: draft.followUpNumber, body: draft.body } : null}
      lastFromThem={lastIn ? { body: lastIn.bodyText, at: lastIn.createdAt } : null}
      activity={leadActivity}
      meetings={meetings}
      today={teamTodayISO()}
      messages={
        <MessagesPanel
          leadId={lead.id}
          leadEmail={lead.email}
          contactName={lead.prospect?.contactName ?? null}
          suggestedOpener={lead.prospect?.outreachHook ?? null}
          messages={messages}
          accounts={accounts}
        />
      }
    />
  );
}
