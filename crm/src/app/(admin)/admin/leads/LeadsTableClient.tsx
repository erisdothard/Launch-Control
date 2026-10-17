"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LEAD_STATUSES, type Lead, type LeadStatus } from "@/lib/store/types";
import { updateLeadStatusAction, deleteLeadAction } from "./actions";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface LeadsTableClientProps {
  leads: Lead[];
  statusFilter?: LeadStatus;
  searchQuery: string;
}

export default function LeadsTableClient({ leads, statusFilter, searchQuery }: LeadsTableClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(searchQuery);

  function pushParams(next: { status?: string; search?: string }) {
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

  function handleStatusFilter(status: LeadStatus | "all") {
    pushParams({ status: status === "all" ? undefined : status });
  }

  function handleStatusChange(id: string, status: LeadStatus) {
    startTransition(async () => {
      await updateLeadStatusAction(id, status);
      router.refresh();
    });
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

      {/* Status filter pills */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(["all", ...LEAD_STATUSES] as const).map((s) => {
          const active = s === "all" ? !statusFilter : statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => handleStatusFilter(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                active
                  ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                  : "bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:bg-white/[0.05]"
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] label-mono text-[var(--color-text-dim)]">
              <th className="px-5 py-3 font-medium">Business</th>
              <th className="px-5 py-3 font-medium">Contact</th>
              <th className="px-5 py-3 font-medium">Source</th>
              <th className="px-5 py-3 font-medium">Status</th>
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
                <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={lead.status}
                    onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                    className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs font-medium text-[var(--color-text)] capitalize outline-none focus:border-[var(--color-accent)]/50"
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-5 py-4 text-[var(--color-text-dim)]">{formatDate(lead.createdAt)}</td>
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
                <td colSpan={6} className="px-5 py-12 text-center text-[var(--color-text-dim)]">
                  No leads found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
