"use client";

import LocalDate from "@/components/admin/LocalDate";
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import StatusBadge, { statusLabel } from "@/components/admin/StatusBadge";
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

const selectClass = "field !w-auto min-w-0 sm:min-w-44";

function formatDate(iso: string) {
  return <LocalDate iso={iso} options={{ month: "short", day: "numeric", year: "numeric" }} />;
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

const RUN_STATUS_TEXT: Record<LeadGenRun["status"], { label: string; className: string }> = {
  completed: { label: "Finished", className: "text-[var(--color-success)]" },
  failed: { label: "Stopped with an error", className: "text-[var(--color-hot)]" },
  cancelled: { label: "Cancelled", className: "text-[var(--color-text-dim)]" },
  queued: { label: "Waiting", className: "text-[var(--color-warm)]" },
  running: { label: "Running", className: "text-[var(--color-warm)]" },
};

// The last finished search, as one plain sentence; the one in progress is shown by FindLeadsPanel.
function RunStrip({ runs }: { runs: LeadGenRun[] }) {
  const latest = runs.find((r) => r.status !== "queued" && r.status !== "running");
  if (!latest) return null;
  const status = RUN_STATUS_TEXT[latest.status];

  return (
    <div className="mb-8 -mt-3 flex flex-col gap-1 text-sm text-[var(--color-text-muted)] sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2">
      <span>
        Last search {formatDate(latest.startedAt)}: <span className={`font-medium ${status.className}`}>{status.label}</span>.
      </span>
      <span className="tabular">
        Found <b className="font-medium text-[var(--color-text)]">{latest.found}</b>, checked{" "}
        <b className="font-medium text-[var(--color-text)]">{latest.enriched}</b>, kept <b className="font-medium text-[var(--color-text)]">{latest.kept}</b>{" "}
        and left out <b className="font-medium text-[var(--color-text)]">{latest.excluded}</b>.
      </span>
      {latest.error && (
        <span className="line-clamp-2 break-all text-[var(--color-hot)] sm:basis-full" title={latest.error}>
          {latest.error}
        </span>
      )}
    </div>
  );
}

// Score as a figure, not a coloured tile. Only "Hot" carries colour (yellow = act now).
function ScoreFigure({ score }: { score: number | null }) {
  const band = scoreBand(score);
  return (
    <div className="w-14 shrink-0 text-right">
      <p className="text-[26px] leading-none font-light tracking-[-0.02em] text-[var(--color-steel)] tabular">{score ?? "–"}</p>
      <p className={`mt-1.5 text-sm ${band?.label === "Hot" ? "font-medium text-[var(--color-accent)]" : "text-[var(--color-text-dim)]"}`}>
        {band?.label ?? "No score"}
      </p>
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
    <li className="relative border-b border-[var(--color-border)] last:border-0">
      {(p?.score ?? 0) >= 80 && <span aria-hidden="true" className="absolute top-5 bottom-5 left-0 w-1 rounded-r-sm bg-[var(--color-accent)]" />}
      <div className="flex items-start gap-4 px-4 py-5 sm:gap-5 sm:px-6">
        <ScoreFigure score={p?.score ?? null} />

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="group min-w-0 flex-1 text-left"
        >
          <p className="truncate text-base font-semibold text-[var(--color-text)] group-hover:text-white">{lead.businessName}</p>
          <p className="mt-0.5 truncate text-sm text-[var(--color-text-dim)]">
            {[p?.segment, location].filter(Boolean).join(" · ") || "Unclassified"}
          </p>
          {p?.scoreReason && <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-[var(--color-text-muted)]">{p.scoreReason}</p>}
          <span className="mt-2.5 flex items-center justify-between sm:hidden">
            <StatusBadge status={lead.status} />
            <span className="text-sm text-[var(--color-text-dim)]">{open ? "Hide details" : "Details"}</span>
          </span>
        </button>

        <div className="hidden w-60 shrink-0 text-sm lg:block">
          <p className="truncate text-[15px] text-[var(--color-text)]">{p?.contactName || "No named contact"}</p>
          {p?.contactTitle && <p className="truncate text-[var(--color-text-dim)]">{p.contactTitle}</p>}
          <p className="mt-1 truncate text-[var(--color-text-muted)]">{lead.email || lead.phone || "No email or phone found"}</p>
        </div>

        <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
          <StatusBadge status={lead.status} />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Hide details" : "Show details"}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-dim)] transition-colors duration-150 hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text)]"
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
        <div className="space-y-5 px-4 pb-6 sm:pr-6 sm:pl-[100px]">
          <div className="grid gap-4 lg:hidden">
            <div className="text-[15px]">
              <p className="text-[var(--color-text)]">{p?.contactName || "No named contact"}</p>
              {p?.contactTitle && <p className="text-sm text-[var(--color-text-dim)]">{p.contactTitle}</p>}
            </div>
          </div>

          {p?.outreachHook && (
            <div className="well px-5 py-4">
              <p className="text-sm text-[var(--color-text-dim)]">Opening angle</p>
              <p className="mt-1 text-base leading-relaxed text-[var(--color-text)]">{p.outreachHook}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="text-[var(--color-text)] underline decoration-[var(--color-border-bright)] underline-offset-4 hover:decoration-[var(--color-steel)]">
                {lead.email}
              </a>
            )}
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="text-[var(--color-text-muted)] underline-offset-4 hover:text-[var(--color-text)] hover:underline">
                {lead.phone}
              </a>
            )}
            {website && (
              <a href={website} target="_blank" rel="noopener noreferrer" className="text-[var(--color-text-muted)] underline-offset-4 hover:text-[var(--color-text)] hover:underline">
                {hostname(website)} ↗
              </a>
            )}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-text-muted)] underline-offset-4 hover:text-[var(--color-text)] hover:underline">
                Google Maps ↗
              </a>
            )}
          </div>

          <SignalChips lead={lead} />
          <FactorBars lead={lead} />

          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/admin/leads/${lead.id}`} className="btn btn-secondary btn-sm">
              Open lead
            </Link>
            <button type="button" disabled={pending || lead.status === "lost"} onClick={onNotAFit} className="btn-quiet text-[15px] disabled:opacity-50">
              Not a fit
            </button>
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

  const hasFilters = Boolean(filters.segment || filters.state || filters.status || filters.minScore || searchParams.get("has"));
  const hot = prospects.filter((l) => (l.prospect?.score ?? 0) >= 80).length;
  const withContact = prospects.filter((l) => l.prospect?.contactName && (l.email || l.phone)).length;
  const exportHref = `/admin/lead-gen/export${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  return (
    <div>
      <FindLeadsPanel active={runs.find((r) => r.status === "queued" || r.status === "running") ?? null} startOpen={prospects.length === 0 && !hasFilters} />
      <RunStrip runs={runs} />

      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
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
            className={selectClass}
          >
            <option value="">Any status</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
          <div className="col-span-2 flex h-11 items-center rounded-[var(--radius-sm)] bg-[var(--color-bg-secondary)] p-1" role="group" aria-label="Minimum score">
            {MIN_SCORE_OPTIONS.map((opt) => {
              const active = (filters.minScore ?? 0) === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pushParam("min", opt.value ? String(opt.value) : undefined)}
                  className={`h-full flex-1 rounded-[5px] px-3 text-sm tabular transition-colors duration-150 ${
                    active ? "bg-[var(--color-steel)] font-medium text-[var(--color-on-accent)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
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
          className="btn btn-secondary shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2v8M5 7l3 3 3-3M3 13h10" />
          </svg>
          Export CSV
        </a>
      </div>

      <div className="mb-6">
        <ContactFilterChips />
      </div>

      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-semibold text-[var(--color-text)]">Best fit first</h2>
        <p className="text-sm text-[var(--color-text-muted)] tabular">
          <span className="font-medium text-[var(--color-text)]">{prospects.length}</span> prospects ·{" "}
          <span className="font-medium text-[var(--color-accent)]">{hot}</span> hot ·{" "}
          <span className="font-medium text-[var(--color-text)]">{withContact}</span> with a named contact
        </p>
      </div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-[var(--color-hot)]">
          {error}
        </p>
      )}

      <ul className="card overflow-hidden">
        {prospects.map((lead) => (
          <ProspectRow
            key={lead.id}
            lead={lead}
            pending={pendingId === lead.id}
            onNotAFit={() => handleNotAFit(lead.id)}
          />
        ))}
        {prospects.length === 0 && (
          <li className="px-6 py-12 text-base text-[var(--color-text-muted)]">No prospects match these filters. Clear one or two to see more.</li>
        )}
      </ul>
    </div>
  );
}
