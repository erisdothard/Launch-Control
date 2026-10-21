import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { getLeadViewCounts, getLeads } from "@/lib/store/leads";
import { LEAD_VIEWS, type LeadView } from "@/lib/store/types";
import LeadsTableClient from "./LeadsTableClient";
import { parseHas } from "@/lib/leads/contactFilter";
import { teamTodayISO } from "@/lib/leads/followUp";

interface LeadsPageProps {
  searchParams: Promise<{ view?: string; search?: string; has?: string }>;
}

// With no view chosen, open on the first one that has work in it, so the page starts on what to do.
const WORK_VIEWS: LeadView[] = ["needs-reply", "follow-up", "in-play"];

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = await searchParams;
  const search = params.search ?? "";
  const today = teamTodayISO();
  const counts = await getLeadViewCounts(today);
  const view: LeadView =
    LEAD_VIEWS.find((v) => v.key === params.view)?.key ?? WORK_VIEWS.find((v) => counts[v] > 0) ?? "all";

  const leads = await getLeads({ view, today, search: search || undefined, has: parseHas(params.has) });

  const n = leads.length;
  const lede =
    n === 0
      ? "Nobody in this view. Pick another view above, or add a lead."
      : `${n === counts.all ? "Everyone" : `${n} of ${counts.all}`} shown. Open anyone to see their history, or tick people to email them together.`;

  return (
    <>
      <AdminHeader
        title="Leads"
        subtitle={lede}
        actions={
          <>
            <Link href="/admin/campaigns/new" className="btn btn-secondary">
              Mass email
            </Link>
            <Link href="/admin/leads/import" className="btn btn-secondary">
              Import
            </Link>
            <Link href="/admin/leads/new" className="btn btn-secondary">
              Add lead
            </Link>
          </>
        }
      />
      <LeadsTableClient leads={leads} view={view} counts={counts} searchQuery={search} today={today} />
    </>
  );
}
