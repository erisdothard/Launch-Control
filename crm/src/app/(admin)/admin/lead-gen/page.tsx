import AdminHeader from "@/components/admin/AdminHeader";
import { getLeads } from "@/lib/store/leads";
import { getFacets, getRuns } from "@/lib/store/leadgen";
import { AUTOMATED_LEAD_SOURCE } from "@/lib/store/types";
import { parseLeadGenFilters } from "./filters";
import LeadGenClient from "./LeadGenClient";

interface LeadGenPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function LeadGenPage({ searchParams }: LeadGenPageProps) {
  const filters = parseLeadGenFilters(await searchParams);
  const [found, runs, facets] = await Promise.all([
    getLeads({ detail: true, source: AUTOMATED_LEAD_SOURCE, sortByScore: true, ...filters }),
    getRuns(5),
    getFacets(),
  ]);
  // Blocked or asked-to-stop businesses are kept (so they are never found again) but not listed.
  const prospects = found.filter((lead) => !lead.doNotContact);

  return (
    <>
      <AdminHeader
        title="Lead Gen"
      />
      <LeadGenClient prospects={prospects} runs={runs} facets={facets} filters={filters} />
    </>
  );
}
