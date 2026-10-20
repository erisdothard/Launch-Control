import { notFound } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import { getLeadById } from "@/lib/store/leads";
import { getActivityLog } from "@/lib/store/activity";
import LeadDetailClient from "./LeadDetailClient";
import MessagesPanel from "./MessagesPanel";
import { getEmailAccounts, getThread } from "@/lib/store/messages";
import { getUpcomingEventsForLead } from "@/lib/store/calendar";
import { teamTodayISO } from "@/lib/leads/followUp";
import { getPendingDrafts } from "@/lib/store/drafts";
import Link from "next/link";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLeadById(id);
  if (!lead) notFound();

  const [allActivity, messages, accounts, meetings, drafts] = await Promise.all([
    getActivityLog(200),
    getThread(id),
    getEmailAccounts(),
    getUpcomingEventsForLead(id),
    getPendingDrafts(),
  ]);
  const draft = drafts.find((d) => d.leadId === id);
  const leadActivity = allActivity.filter((a) => a.entityType === "lead" && a.entityId === id);

  return (
    <>
      <AdminHeader title={lead.businessName} subtitle={`Added ${new Date(lead.createdAt).toLocaleDateString()}`} />
      {draft && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/[0.06] px-5 py-3">
          <p className="text-sm text-[var(--color-text)]">
            {draft.kind === "reply" ? "A reply to their last message is drafted and waiting." : `Follow-up ${draft.followUpNumber ?? ""} is drafted and waiting.`}
          </p>
          <Link
            href="/admin/drafts"
            className="rounded-[2px] bg-[var(--color-accent)] px-3.5 py-2 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]"
          >
            Review in Drafts
          </Link>
        </div>
      )}
      <div className="mb-6">
        <MessagesPanel
          leadId={lead.id}
          leadEmail={lead.email}
          contactName={lead.prospect?.contactName ?? null}
          suggestedOpener={lead.prospect?.outreachHook ?? null}
          messages={messages}
          accounts={accounts}
        />
      </div>
      <LeadDetailClient lead={lead} activity={leadActivity} meetings={meetings} today={teamTodayISO()} />
    </>
  );
}
