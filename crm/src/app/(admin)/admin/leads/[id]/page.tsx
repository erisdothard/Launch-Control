import { notFound } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import { getLeadById } from "@/lib/store/leads";
import { getActivityLog } from "@/lib/store/activity";
import LeadDetailClient from "./LeadDetailClient";
import MessagesPanel from "./MessagesPanel";
import { getEmailAccounts, getThread } from "@/lib/store/messages";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLeadById(id);
  if (!lead) notFound();

  const [allActivity, messages, accounts] = await Promise.all([getActivityLog(200), getThread(id), getEmailAccounts()]);
  const leadActivity = allActivity.filter((a) => a.entityType === "lead" && a.entityId === id);

  return (
    <>
      <AdminHeader title={lead.businessName} subtitle={`Added ${new Date(lead.createdAt).toLocaleDateString()}`} />
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
      <LeadDetailClient lead={lead} activity={leadActivity} />
    </>
  );
}
