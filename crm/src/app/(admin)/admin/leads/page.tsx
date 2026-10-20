import AdminHeader from "@/components/admin/AdminHeader";
import { getLeadViewCounts, getLeads, getUntouchedProspectCount } from "@/lib/store/leads";
import { LEAD_VIEWS, type LeadView } from "@/lib/store/types";
import LeadsListClient from "./LeadsListClient";
import { teamTodayISO } from "@/lib/leads/followUp";

interface LeadsPageProps {
  searchParams: Promise<{ view?: string; search?: string; include?: string }>;
}

// With no view chosen, open on the first one that has work in it, so the page starts on what to do.
const WORK_VIEWS: LeadView[] = ["needs-reply", "follow-up", "in-play"];

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = await searchParams;
  const search = params.search ?? "";
  const today = teamTodayISO();
  // Prospects Lead Gen found but nobody has touched live on the Lead Gen page unless asked for here.
  const showingProspects = params.include === "prospects";
  const excludeUntouchedProspects = !showingProspects;

  const [counts, hiddenProspects] = await Promise.all([
    getLeadViewCounts(today, undefined, { excludeUntouchedProspects }),
    getUntouchedProspectCount(),
  ]);
  const view: LeadView =
    LEAD_VIEWS.find((v) => v.key === params.view)?.key ?? WORK_VIEWS.find((v) => counts[v] > 0) ?? "all";

  const leads = await getLeads({ view, today, search: search || undefined, excludeUntouchedProspects });

  return (
    <>
      <AdminHeader
        title="Leads"
        subtitle={`${leads.length} of ${counts.all} lead${counts.all !== 1 ? "s" : ""}`}
      />
      <LeadsListClient
        leads={leads}
        view={view}
        counts={counts}
        searchQuery={search}
        today={today}
        hiddenProspects={hiddenProspects}
        showingProspects={showingProspects}
      />
    </>
  );
}
