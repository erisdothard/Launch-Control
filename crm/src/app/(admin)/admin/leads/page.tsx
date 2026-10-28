import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { getLeadViewCounts, getLeads } from "@/lib/store/leads";
import { LEAD_VIEWS, type LeadView } from "@/lib/store/types";
import LeadsTableClient from "./LeadsTableClient";
import { parseHas } from "@/lib/leads/contactFilter";
import { teamTodayISO } from "@/lib/leads/followUp";
import { byFollowUpDate, dueBucket, parseDue, type DueFilterKey } from "@/lib/leads/dueFilter";

interface LeadsPageProps {
  searchParams: Promise<{ view?: string; search?: string; has?: string; due?: string }>;
}

// With no view chosen, open on the first one that has work in it, so the page starts on what to do.
const WORK_VIEWS: LeadView[] = ["needs-reply", "follow-up", "new-inquiries", "in-play"];

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = await searchParams;
  const search = params.search ?? "";
  const today = teamTodayISO();
  const counts = await getLeadViewCounts(today);
  const view: LeadView =
    LEAD_VIEWS.find((v) => v.key === params.view)?.key ?? WORK_VIEWS.find((v) => counts[v] > 0) ?? "all";

  const inView = await getLeads({ view, today, search: search || undefined, has: parseHas(params.has) });

  // The follow-up date filter splits whatever view you're in; its counts are for that view.
  const due = parseDue(params.due);
  const dueCounts: Record<DueFilterKey, number> = { overdue: 0, today: 0, upcoming: 0, none: 0 };
  for (const lead of inView) dueCounts[dueBucket(lead.followUpOn, today)] += 1;
  const filtered = due ? inView.filter((lead) => dueBucket(lead.followUpOn, today) === due) : inView;
  // Date-driven lists read soonest first, so overdue and due today stop being mixed in by when they were added.
  const leads = due || view === "follow-up" || view === "waiting" ? byFollowUpDate(filtered) : filtered;

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
            <Link href="/admin/leads/import" className="btn btn-secondary">
              Import
            </Link>
            <Link href="/admin/leads/new" className="btn btn-secondary">
              Add lead
            </Link>
          </>
        }
      />
      <LeadsTableClient leads={leads} view={view} counts={counts} searchQuery={search} today={today} due={due} dueCounts={dueCounts} />
    </>
  );
}
