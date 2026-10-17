import { notFound } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import { getLeadById } from "@/lib/store/leads";
import { getActivityLog } from "@/lib/store/activity";
import LeadDetailClient from "./LeadDetailClient";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLeadById(id);
  if (!lead) notFound();

  const allActivity = await getActivityLog(200);
  const leadActivity = allActivity.filter((a) => a.entityType === "lead" && a.entityId === id);

  return (
    <>
      <AdminHeader title={lead.businessName} subtitle={`Added ${new Date(lead.createdAt).toLocaleDateString()}`} />
      <LeadDetailClient lead={lead} activity={leadActivity} />
    </>
  );
}
