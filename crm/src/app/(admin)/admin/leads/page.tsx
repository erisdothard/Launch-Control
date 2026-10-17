import AdminHeader from "@/components/admin/AdminHeader";
import { getLeads, type LeadStatus } from "@/lib/store/leads";
import LeadsTableClient from "./LeadsTableClient";
import { parseHas } from "@/lib/leads/contactFilter";

interface LeadsPageProps {
  searchParams: Promise<{ status?: string; search?: string; has?: string }>;
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = await searchParams;
  const status = params.status as LeadStatus | undefined;
  const search = params.search ?? "";

  const leads = await getLeads({ status, search: search || undefined, has: parseHas(params.has) });
  const allLeads = await getLeads();

  return (
    <>
      <AdminHeader
        title="Leads"
        subtitle={`${leads.length} of ${allLeads.length} lead${allLeads.length !== 1 ? "s" : ""}`}
      />
      <LeadsTableClient leads={leads} statusFilter={status} searchQuery={search} />
    </>
  );
}
