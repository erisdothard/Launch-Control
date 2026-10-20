"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LEAD_VIEWS, type Lead, type LeadView } from "@/lib/store/types";
import { leadState, toneClass, toneLabel } from "@/lib/leads/state";

interface LeadsListClientProps {
  leads: Lead[];
  view: LeadView;
  counts: Record<LeadView, number>;
  searchQuery: string;
  today: string;
  /** Prospects Lead Gen found that nobody has touched; hidden unless ?include=prospects. */
  hiddenProspects: number;
  showingProspects: boolean;
}

const EMPTY: Record<LeadView, string> = {
  "needs-reply": "Nobody is waiting on a reply.",
  "follow-up": "No follow-ups due.",
  waiting: "You are not waiting on anyone right now.",
  "in-play": "No meetings, proposals or negotiations open.",
  "not-contacted": "Everyone here has been contacted.",
  closed: "Nothing closed yet.",
  all: "No leads yet.",
};

function contactLine(lead: Lead): string {
  return [lead.prospect?.contactName, lead.email, lead.phone].filter(Boolean).join(" · ");
}

// The one button a row shows. Reply/Email/Follow up go to the compose box; Call dials the phone.
function RowAction({ lead, today }: { lead: Lead; today: string }) {
  const state = leadState(lead, today);
  if (state.action === "none") return <div aria-hidden="true" className="hidden sm:block sm:w-32" />;
  if (state.action === "call") {
    return (
      <a href={`tel:${lead.phone}`} className="btn btn-secondary w-full sm:w-32">
        {state.actionLabel}
      </a>
    );
  }
  return (
    <Link href={`/admin/leads/${lead.id}#messages`} className="btn btn-primary w-full sm:w-32">
      {state.actionLabel}
    </Link>
  );
}

function LeadRow({ lead, today }: { lead: Lead; today: string }) {
  const state = leadState(lead, today);
  const contact = contactLine(lead);
  return (
    <li className="flex min-h-[72px] flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
      <Link
        href={`/admin/leads/${lead.id}`}
        className="grid min-w-0 flex-1 grid-cols-1 gap-2 rounded-[2px] sm:grid-cols-2 sm:gap-6"
      >
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[var(--color-text)]">{lead.businessName}</p>
          {contact && <p className="t-small mt-0.5 truncate text-[var(--color-text-muted)]">{contact}</p>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className={toneClass(state.tone)}>{toneLabel(lead, state)}</span>
          <span className="t-small min-w-0 text-[var(--color-text-muted)]">{state.line}</span>
        </div>
      </Link>
      <div className="shrink-0">
        <RowAction lead={lead} today={today} />
      </div>
    </li>
  );
}

export default function LeadsListClient({
  leads,
  view,
  counts,
  searchQuery,
  today,
  hiddenProspects,
  showingProspects,
}: LeadsListClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchQuery);

  function hrefWith(next: Record<string, string | undefined>): string {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) sp.set(key, value);
      else sp.delete(key);
    }
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(hrefWith({ search: search.trim() || undefined }));
  }

  const emptyText = searchQuery ? `No leads match “${searchQuery}”.` : EMPTY[view];

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearchSubmit} role="search" className="flex-1 sm:max-w-md">
          <label className="sr-only" htmlFor="lead-search">
            Search leads
          </label>
          <input
            id="lead-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads"
            className="input"
          />
        </form>
        <div className="flex shrink-0 gap-3">
          <Link href="/admin/leads/import" className="btn btn-secondary flex-1 sm:flex-none">
            Import
          </Link>
          <Link href="/admin/leads/new" className="btn btn-primary flex-1 sm:flex-none">
            Add Lead
          </Link>
        </div>
      </div>

      {hiddenProspects > 0 && !showingProspects && (
        <p className="t-small mb-4 text-[var(--color-text-dim)]">
          {hiddenProspects} prospect{hiddenProspects === 1 ? "" : "s"} found by Lead Gen {hiddenProspects === 1 ? "is" : "are"} not shown
          here.{" "}
          <Link href="/admin/lead-gen" className="link">
            Open Lead Gen →
          </Link>{" "}
          <span aria-hidden="true">·</span>{" "}
          <Link href={hrefWith({ include: "prospects" })} className="link">
            show them here
          </Link>
        </p>
      )}
      {showingProspects && (
        <p className="t-small mb-4 text-[var(--color-text-dim)]">
          Showing prospects found by Lead Gen as well.{" "}
          <Link href={hrefWith({ include: undefined })} className="link">
            Hide them again
          </Link>
        </p>
      )}

      {/* Views: kept current by the database, so a lead shows up here the moment something happens. */}
      <nav aria-label="Lead views" className="mb-4 flex flex-wrap gap-1 border-b border-[var(--color-border)]">
        {LEAD_VIEWS.map((v) => {
          const active = v.key === view;
          return (
            <Link
              key={v.key}
              href={hrefWith({ view: v.key })}
              aria-current={active ? "page" : undefined}
              className={`-mb-px inline-flex min-h-[var(--control-height)] shrink-0 items-center gap-2 border-b-2 px-3 text-base font-medium transition-colors ${
                active
                  ? "border-[var(--color-accent)] text-[var(--color-text)]"
                  : "border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-tint-hover)] hover:text-[var(--color-text)]"
              }`}
            >
              {v.label}
              <span className="t-small tabular-nums text-[var(--color-text-dim)]">{counts[v.key]}</span>
            </Link>
          );
        })}
      </nav>

      <ul className="card divide-y divide-[var(--color-border)]">
        {leads.map((lead) => (
          <LeadRow key={lead.id} lead={lead} today={today} />
        ))}
        {leads.length === 0 && <li className="px-5 py-12 text-center text-[var(--color-text-dim)]">{emptyText}</li>}
      </ul>
    </div>
  );
}
