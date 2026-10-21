"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LEAD_VIEWS, type Lead, type LeadView } from "@/lib/store/types";
import StatusBadge from "@/components/admin/StatusBadge";
import ContactFilterChips from "@/components/admin/ContactFilterChips";
import LocalDate from "@/components/admin/LocalDate";
import { followUpState } from "@/lib/leads/followUp";
import { Avatar, Check } from "@/components/compose/ui";
import { HANDOFF_KEY, URL_LEAD_LIMIT } from "@/components/compose/types";

function displayName(lead: Lead): { primary: string; secondary: string } {
  const person = lead.prospect?.contactName?.trim();
  return person ? { primary: person, secondary: lead.businessName } : { primary: lead.businessName, secondary: "" };
}

function LastContact({ lead }: { lead: Lead }) {
  if (lead.awaiting === "us" && lead.lastReplyAt) {
    return (
      <span className="font-medium text-[var(--color-hot)]">
        Replied <LocalDate iso={lead.lastReplyAt} options={{ month: "short", day: "numeric" }} />
      </span>
    );
  }
  if (lead.lastContactedAt) {
    return (
      <span>
        Emailed <LocalDate iso={lead.lastContactedAt} options={{ month: "short", day: "numeric" }} />
      </span>
    );
  }
  return <span className="text-[var(--color-text-dim)]">Never emailed</span>;
}

function NextStep({ lead, today }: { lead: Lead; today: string }) {
  const due = followUpState(lead.followUpOn, today);
  if (!due && !lead.nextAction) return <span className="text-[var(--color-text-dim)]">Nothing set</span>;
  const tone = due?.label === "Overdue" ? "text-[var(--color-hot)]" : due?.label === "Due today" ? "text-[var(--color-warm)]" : "text-[var(--color-text-dim)]";
  return (
    <span className="min-w-0">
      {lead.nextAction && <span className="block truncate text-[var(--color-text-muted)]">{lead.nextAction}</span>}
      {due && <span className={`block text-[14px] font-medium ${tone}`}>{due.label === "Overdue" || due.label === "Due today" ? due.label : `On ${due.label}`}</span>}
    </span>
  );
}

interface LeadsTableClientProps {
  leads: Lead[];
  view: LeadView;
  counts: Record<LeadView, number>;
  searchQuery: string;
  today: string;
}

// The leads list. Tick people (or everyone in the view) to email them together.
export default function LeadsTableClient({ leads, view, counts, searchQuery, today }: LeadsTableClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchQuery);
  // Kept across views, so a list can be built from more than one view.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function pushParams(next: { view?: string; search?: string }) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) sp.set(key, value);
      else sp.delete(key);
    }
    router.push(`${pathname}?${sp.toString()}`);
  }

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const inViewSelected = leads.filter((l) => selected.has(l.id)).length;
  const allInView = leads.length > 0 && inViewSelected === leads.length;

  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const l of leads) {
        if (on) next.add(l.id);
        else next.delete(l.id);
      }
      return next;
    });
  }

  // Short lists ride in the URL; long ones in sessionStorage so the address never gets too long.
  function emailSelected() {
    const ids = [...selected];
    if (ids.length <= URL_LEAD_LIMIT) {
      router.push(`/admin/campaigns/new?leads=${ids.join(",")}`);
      return;
    }
    try {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(ids));
      router.push("/admin/campaigns/new?leads=handoff");
    } catch {
      router.push(`/admin/campaigns/new?leads=${ids.join(",")}`);
    }
  }

  const hint = LEAD_VIEWS.find((v) => v.key === view)?.hint;

  return (
    <div className={selected.size ? "pb-28" : ""}>
      {/* Views: kept current by the database, so a lead shows up here the moment something happens */}
      <nav aria-label="Lead views" className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-[var(--color-border)] px-1">
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
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-[15px] transition-colors ${
                active
                  ? "border-[var(--color-steel)] font-medium text-[var(--color-text)]"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {v.label}
              <span className={`tabular text-[14px] ${urgent ? "font-semibold text-[var(--color-hot)]" : "text-[var(--color-text-dim)]"}`}>{n}</span>
            </button>
          );
        })}
      </nav>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            pushParams({ search });
          }}
          className="w-full lg:max-w-sm"
          role="search"
        >
          <label className="sr-only" htmlFor="lead-search">
            Search leads
          </label>
          <input
            id="lead-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, company, email or phone"
            className="field"
          />
        </form>
        <ContactFilterChips />
      </div>

      {hint && <p className="mb-2 text-[15px] text-[var(--color-text-dim)]">{hint}</p>}

      <div className="card overflow-hidden">
        {/* Column heads double as the select-all control */}
        <div className="flex items-center gap-4 border-b border-[var(--color-border)] px-4 py-3 sm:px-5 md:grid md:grid-cols-[22px_36px_minmax(0,1fr)_170px_140px_220px]">
          <Check
            checked={allInView}
            indeterminate={inViewSelected > 0}
            onChange={toggleAll}
            label={allInView ? "Clear everyone in this view" : "Select everyone in this view"}
            disabled={leads.length === 0}
          />
          <span className="text-[14px] text-[var(--color-text-dim)] md:col-span-2">
            {inViewSelected > 0 ? `${inViewSelected} of ${leads.length} in this view selected` : `Select all ${leads.length} in this view`}
          </span>
          <span className="hidden text-[14px] text-[var(--color-text-dim)] md:block">Status</span>
          <span className="hidden text-[14px] text-[var(--color-text-dim)] md:block">Last contact</span>
          <span className="hidden text-[14px] text-[var(--color-text-dim)] md:block">Next step</span>
        </div>

        <ul>
          {leads.map((lead) => {
            const name = displayName(lead);
            const on = selected.has(lead.id);
            return (
              <li
                key={lead.id}
                onClick={() => router.push(`/admin/leads/${lead.id}`)}
                className={`group grid cursor-pointer grid-cols-[22px_36px_minmax(0,1fr)] items-start gap-x-4 gap-y-2 border-b border-[var(--color-border)] px-4 py-4 transition-colors last:border-0 hover:bg-[var(--color-bg-hover)] sm:px-5 md:grid-cols-[22px_36px_minmax(0,1fr)_170px_140px_220px] ${
                  on ? "bg-[var(--color-accent)]/[0.04]" : ""
                }`}
              >
                <span className="pt-[7px]">
                  <Check checked={on} onChange={(v) => toggle(lead.id, v)} label={`Select ${name.primary}`} />
                </span>
                <Avatar name={name.primary} />
                <div className="min-w-0">
                  <Link
                    href={`/admin/leads/${lead.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="block truncate text-[16px] font-semibold text-[var(--color-text)] group-hover:text-white"
                  >
                    {name.primary}
                    {name.secondary && <span className="font-normal text-[var(--color-text-dim)]"> · {name.secondary}</span>}
                  </Link>
                  <div className="mt-0.5 truncate text-[15px] text-[var(--color-text-muted)]">
                    {lead.email || <span className="text-[var(--color-text-dim)]">No email</span>}
                    {lead.phone && <span className="text-[var(--color-text-dim)]"> · {lead.phone}</span>}
                  </div>
                  {/* Phones: status, last contact and next step stack under the name */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-[var(--color-text-muted)] md:hidden">
                    <StatusBadge status={lead.status} variant="lead" />
                    <LastContact lead={lead} />
                  </div>
                  <div className="mt-1 text-[14px] md:hidden">
                    <NextStep lead={lead} today={today} />
                  </div>
                </div>
                <div className="hidden min-w-0 pt-0.5 md:block">
                  <StatusBadge status={lead.status} variant="lead" />
                  {lead.statusReason && <div className="mt-1 truncate text-[14px] text-[var(--color-text-dim)]">{lead.statusReason}</div>}
                </div>
                <div className="hidden pt-0.5 text-[15px] text-[var(--color-text-muted)] md:block">
                  <LastContact lead={lead} />
                </div>
                <div className="hidden min-w-0 pt-0.5 text-[15px] md:block">
                  <NextStep lead={lead} today={today} />
                </div>
              </li>
            );
          })}
          {leads.length === 0 && (
            <li className="px-5 py-14 text-center text-[16px] text-[var(--color-text-muted)]">
              {view === "needs-reply" ? "Nobody is waiting on a reply." : view === "follow-up" ? "No follow-ups are due." : "No leads here."}
            </li>
          )}
        </ul>
      </div>

      {/* Action bar: appears once anyone is ticked */}
      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Selected leads"
          className="fixed inset-x-4 bottom-[84px] z-40 mx-auto flex max-w-2xl items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--color-bg-secondary)] px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-border-bright),0_16px_48px_rgba(0,0,0,0.55)] sm:px-5 lg:bottom-6 lg:left-[calc(15rem+2rem)]"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold text-[var(--color-text)]">{selected.size} selected</div>
            <button type="button" onClick={() => setSelected(new Set())} className="btn-quiet text-[14px]">
              Clear
            </button>
          </div>
          <button type="button" onClick={emailSelected} className="btn btn-primary">
            Email {selected.size} {selected.size === 1 ? "person" : "people"}
          </button>
        </div>
      )}
    </div>
  );
}
