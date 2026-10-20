import { notFound } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import { getLeadById } from "@/lib/store/leads";
import { getActivityLog } from "@/lib/store/activity";
import { getCompanyInfo } from "@/lib/store/company";
import LeadDetailClient from "./LeadDetailClient";
import MessagesPanel from "./MessagesPanel";
import { getEmailAccounts, getThread } from "@/lib/store/messages";
import { getUpcomingEventsForLead } from "@/lib/store/calendar";
import { teamTodayISO } from "@/lib/leads/followUp";
import { getPendingDrafts } from "@/lib/store/drafts";
import { leadState, shortDate, toneClass, toneLabel } from "@/lib/leads/state";
import { AUTOMATED_LEAD_SOURCE } from "@/lib/store/types";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLeadById(id);
  if (!lead) notFound();

  const [allActivity, messages, accounts, meetings, drafts, company] = await Promise.all([
    getActivityLog(200),
    getThread(id),
    getEmailAccounts(),
    getUpcomingEventsForLead(id),
    getPendingDrafts(),
    getCompanyInfo(),
  ]);
  const draft = drafts.find((d) => d.leadId === id) ?? null;
  const leadActivity = allActivity.filter((a) => a.entityType === "lead" && a.entityId === id);
  const today = teamTodayISO();
  const state = leadState(lead, today);
  const sourceWords = lead.source === AUTOMATED_LEAD_SOURCE ? "Found by Lead Gen" : lead.source || "Added by hand";

  return (
    <>
      <AdminHeader title={lead.businessName} subtitle={`${sourceWords} · added ${shortDate(lead.createdAt)}`} />

      {/* What is going on with this lead, before anything else. */}
      <p className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-base text-[var(--color-text)]">
        <span className={toneClass(state.tone)}>{toneLabel(lead, state)}</span>
        <span>{state.line}</span>
      </p>

      <div className="mb-6">
        <MessagesPanel
          leadId={lead.id}
          leadEmail={lead.email}
          businessName={lead.businessName}
          companyName={company.name}
          contactName={lead.prospect?.contactName ?? null}
          suggestedOpener={lead.prospect?.outreachHook ?? null}
          messages={messages}
          accounts={accounts}
          draft={draft}
        />
      </div>
      <LeadDetailClient lead={lead} activity={leadActivity} meetings={meetings} today={today} />
    </>
  );
}
