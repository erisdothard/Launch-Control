"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LEAD_VIEWS, type Lead, type LeadView } from "@/lib/store/types";
import { deleteLeadAction } from "./actions";
import StatusBadge from "@/components/admin/StatusBadge";
import ContactFilterChips from "@/components/admin/ContactFilterChips";
import { followUpState } from "@/lib/leads/followUp";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function NextStepCell({ lead, today }: { lead: Lead; today: string }) {
  const due = followUpState(lead.followUpOn, today);
  if (!due && !lead.nextAction) {
    return <span className="text-xs text-[var(--color-text-dim)]">{lead.lastContactedAt ? "—" : "Not contacted"}</span>;
  }
  return (
    <div className="min-w-0">
      {due && <span className={`rounded-[2px] px-1.5 py-0.5 text-[11px] font-medium ${due.className}`}>{due.label}</span>}
      {lead.nextAction && <div className="mt-1 truncate text-xs text-[var(--color-text-muted)]">{lead.nextAction}</div>}
    </div>
  );
}

// Status is read-only: the database sets it from what happened, and says why underneath.
function StatusCell({ lead }: { lead: Lead }) {
  return (
    <div className="min-w-0">
      <StatusBadge status={lead.status} variant="lead" />
      {lead.statusReason && <div className="mt-1 truncate text-xs text-[var(--color-text-dim)]">{lead.statusReason}</div>}
    </div>
  );
}

interface LeadsTableClientProps {
  leads: Lead[];
  view: LeadView;
  counts: Record<LeadView, number>;
  searchQuery: string;
  today: string;
}

export default function LeadsTableClient({ leads, view, counts, searchQuery, today }: LeadsTableClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(searchQuery);

  function pushParams(next: { view?: string; search?: string }) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) sp.set(key, value);
      else sp.delete(key);
    }
    router.push(`${pathname}?${sp.toString()}`);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    pushParams({ search });
  }


  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    startTransition(async () => {
      await deleteLeadAction(id);
      router.refresh();
    });
  }

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearchSubmit} className="flex-1 sm:max-w-xs">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads..."
            className="w-full rounded-[2px] border border-transparent bg-[var(--color-bg-card)] px-4 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-dim)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/30"
          />
        </form>
        <div className="flex shrink-0 gap-2">
        <Link
          href="/admin/leads/import"
          className="inline-flex items-center justify-center rounded-[2px] border border-[var(--color-border-bright)] px-4 py-2 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          Import
        </Link>
        <Link
          href="/admin/leads/new"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[2px] bg-[var(--color-accent)] px-4 py-2 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
          Add Lead
        </Link>
        </div>
      </div>

      {/* Views: kept current by the database, so a lead shows up here the moment something happens */}
      <nav aria-label="Lead views" className="mb-2 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {LEAD_VIEWS.map((v) => {
          const active = v.key === view;
          const n = counts[v.key];
          const urgent = (v.key === "needs-reply" || v.key === "follow-up") && n > 0;
          return (
            <button
              key={v.key}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => pushParams({ view: v.key })}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-[var(--color-accent)] text-[var(--color-text)]"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {v.label}
              <span
                className={`rounded-[2px] px-1.5 py-0.5 text-[11px] tabular-nums ${
                  urgent ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]" : "bg-white/[0.06] text-[var(--color-text-dim)]"
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </nav>
      <p className="mb-4 text-xs text-[var(--color-text-dim)]">{LEAD_VIEWS.find((v) => v.key === view)?.hint}</p>

      <div className="mb-4">
        <ContactFilterChips />
      </div>

      <div className="overflow-hidden rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] label-mono text-[var(--color-text-dim)]">
              <th className="px-5 py-3 font-medium">Business</th>
              <th className="px-5 py-3 font-medium">Contact</th>
              <th className="px-5 py-3 font-medium">Source</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Next step</th>
              <th className="px-5 py-3 font-medium">Added</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className="cursor-pointer border-b border-[var(--color-border)] last:border-0 hover:bg-white/[0.03]"
                onClick={() => router.push(`/admin/leads/${lead.id}`)}
              >
                <td className="px-5 py-4 font-medium text-[var(--color-text)]">{lead.businessName}</td>
                <td className="px-5 py-4 text-[var(--color-text-muted)]">
                  <div>{lead.phone || "—"}</div>
                  {lead.email && <div className="text-xs text-[var(--color-text-dim)]">{lead.email}</div>}
                </td>
                <td className="px-5 py-4 whitespace-nowrap text-[var(--color-text-muted)]">{lead.source}</td>
                <td className="max-w-[12rem] px-5 py-4">
                  <StatusCell lead={lead} />
                </td>
                <td className="max-w-[16rem] px-5 py-4">
                  <NextStepCell lead={lead} today={today} />
                </td>
                <td className="px-5 py-4 whitespace-nowrap text-[var(--color-text-dim)]">{formatDate(lead.createdAt)}</td>
                <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => handleDelete(lead.id, lead.businessName)}
                    className="rounded-[2px] p-1.5 text-[var(--color-text-dim)] transition-colors hover:bg-red-400/10 hover:text-red-400"
                    aria-label={`Delete ${lead.businessName}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 4h10M6.5 4V2.5h3V4M6 7v4M10 7v4M4 4l.5 9a1 1 0 001 1h5a1 1 0 001-1l.5-9" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-[var(--color-text-dim)]">
                  {view === "needs-reply" ? "Nobody is waiting on a reply." : view === "follow-up" ? "No follow-ups due." : "No leads here."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
