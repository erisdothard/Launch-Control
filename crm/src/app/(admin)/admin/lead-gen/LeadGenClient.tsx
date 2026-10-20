"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import StatusBadge from "@/components/admin/StatusBadge";
import { LEAD_STATUSES, type Lead, type LeadGenRun } from "@/lib/store/types";
import { readSignals, scoreBand } from "@/lib/leadgen/factors";
import { FactorBars, SignalChips } from "@/components/admin/ProspectInsights";
import type { LeadGenFilters } from "./filters";
import { markProspectNotAFitAction } from "./actions";
import FindLeadsPanel from "./FindLeadsPanel";
import ContactFilterChips from "@/components/admin/ContactFilterChips";

const MIN_SCORE_OPTIONS = [
  { value: 0, label: "All" },
  { value: 50, label: "50+" },
  { value: 65, label: "65+" },
  { value: 80, label: "80+" },
];

const selectClass =
  "rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/30";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Only http(s) links from scraped data are rendered as hrefs.
function safeHref(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const RUN_STATUS_CLASS: Record<LeadGenRun["status"], string> = {
  completed: "bg-emerald-400/10 text-emerald-300",
  failed: "bg-red-400/10 text-red-300",
  cancelled: "bg-white/[0.06] text-[var(--color-text-muted)]",
  queued: "bg-amber-400/10 text-amber-300",
  running: "bg-amber-400/10 text-amber-300",
};

// The last finished search; the one in progress is shown by FindLeadsPanel.
function RunStrip({ runs }: { runs: LeadGenRun[] }) {
  const latest = runs.find((r) => r.status !== "queued" && r.status !== "running");
  if (!latest) return null;

  const steps = [
    { label: "Found", value: latest.found },
    { label: "Enriched", value: latest.enriched },
    { label: "Kept", value: latest.kept },
    { label: "Excluded", value: latest.excluded },
  ];

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="label-mono text-[var(--color-text-dim)]">Last search</p>
        <p className="mt-1 text-sm text-[var(--color-text)]">
          {formatDate(latest.startedAt)}
          <span className={`ml-2 rounded-[2px] px-2 py-0.5 text-xs font-medium ${RUN_STATUS_CLASS[latest.status]}`}>
            {latest.status}
          </span>
        </p>
        {latest.error && <p className="mt-1 line-clamp-2 break-all text-xs text-red-400" title={latest.error}>{latest.error}</p>}
      </div>
      <ol className="flex items-center gap-2 sm:gap-3">
        {steps.map((step, i) => (
          <li key={step.label} className="flex items-center gap-2 sm:gap-3">
            <div className="text-center">
              <p className="text-xl font-semibold tabular-nums text-[var(--color-text)]">{step.value}</p>
              <p className="text-[11px] text-[var(--color-text-dim)]">{step.label}</p>
            </div>
            {i < steps.length - 2 && <span className="text-[var(--color-text-dim)]">→</span>}
            {i === steps.length - 2 && <span className="mx-1 h-8 w-px bg-[var(--color-border)]" />}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ScoreChip({ score }: { score: number | null }) {
  const band = scoreBand(score);
  return (
    <div
      className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[2px] ${band?.className ?? "bg-white/[0.06] text-[var(--color-text-dim)]"}`}
    >
      <span className="text-lg font-semibold leading-none tabular-nums">{score ?? "–"}</span>
      <span className="mt-1 label-mono opacity-80">{band?.label ?? "n/a"}</span>
    </div>
  );
}

function ProspectRow({ lead, onNotAFit, pending }: { lead: Lead; onNotAFit: () => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const p = lead.prospect;
  const location = [p?.city, p?.state].filter(Boolean).join(", ");
  const website = safeHref(p?.website ?? null);
  const mapsUrl = safeHref(readSignals(p?.signals ?? null).mapsUrl);

  return (
    <li className="border-b border-[var(--color-border)] last:border-0">
      <div className="flex items-start gap-4 px-4 py-4 sm:px-5">
        <ScoreChip score={p?.score ?? null} />

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate font-medium text-[var(--color-text)]">{lead.businessName}</p>
          <p className="mt-0.5 truncate text-xs text-[var(--color-text-dim)]">
            {[p?.segment, location].filter(Boolean).join(" · ") || "Unclassified"}
          </p>
          {p?.scoreReason && <p className="mt-1.5 line-clamp-2 text-sm text-[var(--color-text-muted)]">{p.scoreReason}</p>}
        </button>

        <div className="hidden w-56 shrink-0 text-sm md:block">
          <p className="truncate text-[var(--color-text)]">{p?.contactName || "—"}</p>
          {p?.contactTitle && <p className="truncate text-xs text-[var(--color-text-dim)]">{p.contactTitle}</p>}
          <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">{lead.email || lead.phone || "No contact found"}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge status={lead.status} />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Hide details" : "Show details"}
            className="rounded-[2px] p-1 text-[var(--color-text-dim)] hover:bg-white/[0.05]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className={`transition-transform duration-[var(--duration-fast)] ${open ? "rotate-180" : ""}`}
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-5 bg-[var(--color-bg-secondary)]/60 px-4 pb-5 pt-4 sm:px-5 sm:pl-[92px]">
          <div className="grid gap-4 md:hidden">
            <div className="text-sm">
              <p className="text-[var(--color-text)]">{p?.contactName || "No named contact"}</p>
              {p?.contactTitle && <p className="text-xs text-[var(--color-text-dim)]">{p.contactTitle}</p>}
            </div>
          </div>

          {p?.outreachHook && (
            <div>
              <p className="label-mono text-[var(--color-text-dim)]">Opening angle</p>
              <p className="mt-1 text-sm text-[var(--color-text)]">{p.outreachHook}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="text-[var(--color-accent)] hover:underline">
                {lead.email}
              </a>
            )}
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="text-[var(--color-text-muted)] hover:underline">
                {lead.phone}
              </a>
            )}
            {website && (
              <a href={website} target="_blank" rel="noopener noreferrer" className="text-[var(--color-text-muted)] hover:underline">
                {hostname(website)} ↗
              </a>
            )}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-text-muted)] hover:underline">
                Google Maps ↗
              </a>
            )}
          </div>

          <SignalChips lead={lead} />
          <FactorBars lead={lead} />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || lead.status === "lost"}
              onClick={onNotAFit}
              className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-white/[0.05] disabled:opacity-50"
            >
              Not a fit
            </button>
            <Link
              href={`/admin/leads/${lead.id}`}
              className="rounded-[2px] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-white/[0.05]"
            >
              Open lead →
            </Link>
          </div>
        </div>
      )}
    </li>
  );
}

interface LeadGenClientProps {
  prospects: Lead[];
  runs: LeadGenRun[];
  facets: { segments: string[]; states: string[] };
  filters: LeadGenFilters;
}

export default function LeadGenClient({ prospects, runs, facets, filters }: LeadGenClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pushParam(key: string, value: string | undefined) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    router.push(`${pathname}?${sp.toString()}`);
  }

  function handleNotAFit(id: string) {
    setPendingId(id);
    setError(null);
    startTransition(async () => {
      try {
        await markProspectNotAFitAction(id);
        router.refresh();
      } catch {
        setError("Couldn't update that lead. Try again.");
      } finally {
        setPendingId(null);
      }
    });
  }

  const hot = prospects.filter((l) => (l.prospect?.score ?? 0) >= 80).length;
  const withContact = prospects.filter((l) => l.prospect?.contactName && (l.email || l.phone)).length;
  const exportHref = `/admin/lead-gen/export${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  return (
    <div>
      <FindLeadsPanel active={runs.find((r) => r.status === "queued" || r.status === "running") ?? null} />
      <RunStrip runs={runs} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Segment"
            value={filters.segment ?? ""}
            onChange={(e) => pushParam("segment", e.target.value || undefined)}
            className={selectClass}
          >
            <option value="">All segments</option>
            {facets.segments.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            aria-label="State"
            value={filters.state ?? ""}
            onChange={(e) => pushParam("state", e.target.value || undefined)}
            className={selectClass}
          >
            <option value="">All states</option>
            {facets.states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            aria-label="Status"
            value={filters.status ?? ""}
            onChange={(e) => pushParam("status", e.target.value || undefined)}
            className={`${selectClass} capitalize`}
          >
            <option value="">Any status</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="flex rounded-[2px] bg-[var(--color-bg-card)] p-0.5 ring-1 ring-[var(--color-border)]" role="group" aria-label="Minimum score">
            {MIN_SCORE_OPTIONS.map((opt) => {
              const active = (filters.minScore ?? 0) === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pushParam("min", opt.value ? String(opt.value) : undefined)}
                  className={`rounded-[2px] px-3 py-1.5 text-xs font-medium transition-colors ${
                    active ? "bg-[var(--color-text)] text-[var(--color-on-accent)]" : "text-[var(--color-text-muted)] hover:bg-white/[0.05]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
        <a
          href={exportHref}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-border-bright)]"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2v8M5 7l3 3 3-3M3 13h10" />
          </svg>
          Export CSV
        </a>
      </div>

      <div className="mb-4">
        <ContactFilterChips />
      </div>

      <p className="mb-3 text-sm text-[var(--color-text-muted)]">
        <span className="font-medium text-[var(--color-text)]">{prospects.length}</span> prospects ·{" "}
        <span className="font-medium text-[var(--color-text)]">{hot}</span> hot ·{" "}
        <span className="font-medium text-[var(--color-text)]">{withContact}</span> with a named contact
      </p>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      <ul className="overflow-hidden rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)]">
        {prospects.map((lead) => (
          <ProspectRow
            key={lead.id}
            lead={lead}
            pending={pendingId === lead.id}
            onNotAFit={() => handleNotAFit(lead.id)}
          />
        ))}
        {prospects.length === 0 && (
          <li className="px-5 py-12 text-center text-sm text-[var(--color-text-dim)]">No prospects match these filters.</li>
        )}
      </ul>
    </div>
  );
}
