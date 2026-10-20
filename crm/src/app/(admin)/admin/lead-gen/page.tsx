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
  const [prospects, runs, facets] = await Promise.all([
    getLeads({ source: AUTOMATED_LEAD_SOURCE, sortByScore: true, ...filters }),
    getRuns(5),
    getFacets(),
  ]);

  return (
    <>
      <AdminHeader
        title="Lead Gen"
        subtitle="Motorsport businesses found and scored against Max's targeting criteria, best fit first."
      />
      <LeadGenClient prospects={prospects} runs={runs} facets={facets} filters={filters} />
    </>
  );
}
