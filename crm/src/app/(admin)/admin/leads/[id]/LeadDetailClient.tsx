"use client";

import LocalDate from "@/components/admin/LocalDate";
import { humanDetail } from "@/lib/store/activityText";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/admin/StatusBadge";
import Link from "next/link";
import { AUTOMATED_LEAD_SOURCE, type Lead, type ActivityEntry, type CalendarEvent } from "@/lib/store/types";
import { FactorBars, ScoreBandPill, SignalChips } from "@/components/admin/ProspectInsights";
import {
  markLeadNotAFitAction,
  updateLeadAction,
  deleteLeadAction,
  convertLeadAction,
  convertLeadToDealAction,
} from "../actions";
import NextStepCard from "./NextStepCard";

const labelClass = "t-small mb-1.5 block font-medium text-[var(--color-text-muted)]";

function formatDateTime(iso: string) {
  return <LocalDate iso={iso} options={{ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }} />;
}

const ACTION_LABEL: Record<ActivityEntry["action"], string> = {
  created: "Created",
  updated: "Updated",
  status_changed: "Status changed",
  converted: "Converted",
  deleted: "Deleted",
};

interface LeadDetailClientProps {
  lead: Lead;
  activity: ActivityEntry[];
  meetings: CalendarEvent[];
  today: string; // the team's calendar day, from the server
}

function sourceWords(source: string): string {
  if (source === AUTOMATED_LEAD_SOURCE) return "Found by Lead Gen";
  return source || "Added by hand";
}

export default function LeadDetailClient({ lead, activity, meetings, today }: LeadDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    businessName: lead.businessName,
    email: lead.email,
    phone: lead.phone,
    notes: lead.notes,
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dealValue, setDealValue] = useState<string | null>(null);
  const closed = lead.status === "lost" || lead.status === "converted";

  function handleNotAFit() {
    startTransition(async () => {
      await markLeadNotAFitAction(lead.id);
      router.refresh();
    });
  }

  function handleSaveEdit() {
    startTransition(async () => {
      await updateLeadAction(lead.id, form);
      setEditing(false);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteLeadAction(lead.id);
      router.push("/admin/leads");
    });
  }

  function handleConvert() {
    startTransition(async () => {
      const customer = await convertLeadAction(lead.id);
      if (customer) router.push(`/admin/customers`);
    });
  }

  function handleCreateDeal() {
    startTransition(async () => {
      const result = await convertLeadToDealAction(lead.id, Number(dealValue) || 0);
      if (result.ok) router.push("/admin/deals");
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="card p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Read-only: the database moves the status when something happens, and says why. */}
              <StatusBadge status={lead.status} variant="lead" />
              {lead.statusReason && (
                <span className="t-small text-[var(--color-text-dim)]">
                  {lead.statusReason}
                  {lead.statusChangedAt && <> · {formatDateTime(lead.statusChangedAt)}</>}
                </span>
              )}
              {lead.doNotContact && <span className="pill pill-danger">Do not contact</span>}
            </div>
            {!editing && (
              <button type="button" onClick={() => setEditing(true)} className="btn-quiet">
                Edit details
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="lead-business" className={labelClass}>
                  Business name
                </label>
                <input id="lead-business" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} className="input" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="lead-email" className={labelClass}>
                    Email
                  </label>
                  <input id="lead-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
                </div>
                <div>
                  <label htmlFor="lead-phone" className={labelClass}>
                    Phone
                  </label>
                  <input id="lead-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
                </div>
              </div>
              <div>
                <label htmlFor="lead-notes" className={labelClass}>
                  Notes
                </label>
                <textarea id="lead-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} className="input" />
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={handleSaveEdit} disabled={isPending} className="btn btn-primary">
                  {isPending ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm({ businessName: lead.businessName, email: lead.email, phone: lead.phone, notes: lead.notes });
                    setEditing(false);
                  }}
                  className="btn-quiet"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <dl className="space-y-4">
              <div className="flex flex-col gap-1 border-b border-[var(--color-border)] pb-3 sm:flex-row sm:justify-between sm:gap-4">
                <dt className="text-[var(--color-text-dim)]">Email</dt>
                <dd className="min-w-0 break-words text-[var(--color-text)] sm:text-right">
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="link">
                      {lead.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex flex-col gap-1 border-b border-[var(--color-border)] pb-3 sm:flex-row sm:justify-between sm:gap-4">
                <dt className="text-[var(--color-text-dim)]">Phone</dt>
                <dd className="text-[var(--color-text)] sm:text-right">
                  {lead.phone ? (
                    <a href={`tel:${lead.phone}`} className="link">
                      {lead.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              {lead.prospect?.website && /^https?:\/\//.test(lead.prospect.website) && (
                <div className="flex flex-col gap-1 border-b border-[var(--color-border)] pb-3 sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="text-[var(--color-text-dim)]">Website</dt>
                  <dd className="min-w-0 break-words sm:text-right">
                    <a href={lead.prospect.website} target="_blank" rel="noopener noreferrer" className="link">
                      {lead.prospect.domain ?? lead.prospect.website}
                    </a>
                  </dd>
                </div>
              )}
              <div className="flex flex-col gap-1 border-b border-[var(--color-border)] pb-3 sm:flex-row sm:justify-between sm:gap-4">
                <dt className="text-[var(--color-text-dim)]">Source</dt>
                <dd className="text-[var(--color-text)] sm:text-right">{sourceWords(lead.source)}</dd>
              </div>
              <div>
                <dt className="mb-1.5 text-[var(--color-text-dim)]">Notes</dt>
                <dd className="whitespace-pre-wrap text-[var(--color-text)]">{lead.notes || "No notes yet."}</dd>
              </div>
            </dl>
          )}
        </div>

        {lead.prospect && (
          <div className="card p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[var(--color-text)]">How well they fit</h2>
                <p className="t-small mt-0.5 text-[var(--color-text-dim)]">
                  {[lead.prospect.segment, [lead.prospect.city, lead.prospect.state].filter(Boolean).join(", ")]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <ScoreBandPill score={lead.prospect.score} />
            </div>
            <dl className="mb-5 space-y-3">
              {lead.prospect.contactName && (
                <div>
                  <dt className="t-small text-[var(--color-text-dim)]">Decision-maker</dt>
                  <dd className="text-[var(--color-text)]">
                    {lead.prospect.contactName}
                    {lead.prospect.contactTitle && <span className="text-[var(--color-text-muted)]"> · {lead.prospect.contactTitle}</span>}
                  </dd>
                </div>
              )}
              {lead.prospect.scoreReason && (
                <div>
                  <dt className="t-small text-[var(--color-text-dim)]">Why</dt>
                  <dd className="text-[var(--color-text)]">{lead.prospect.scoreReason}</dd>
                </div>
              )}
              {lead.prospect.outreachHook && (
                <div>
                  <dt className="t-small text-[var(--color-text-dim)]">Opening angle</dt>
                  <dd className="text-[var(--color-text)]">{lead.prospect.outreachHook}</dd>
                </div>
              )}
            </dl>
            <div className="space-y-5">
              <SignalChips lead={lead} />
              <FactorBars lead={lead} />
            </div>
          </div>
        )}

        <div className="card p-6">
          <h2 className="mb-4 text-base font-semibold text-[var(--color-text)]">Activity</h2>
          {activity.length === 0 ? (
            <p className="text-[var(--color-text-dim)]">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {activity.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3">
                  <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--color-accent)]" />
                  <div>
                    <span className="text-[var(--color-text)]">{ACTION_LABEL[entry.action]}</span>
                    {entry.detail && <span className="text-[var(--color-text-muted)]"> {humanDetail(entry.detail)}</span>}
                    <div className="t-small text-[var(--color-text-dim)]">{formatDateTime(entry.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <NextStepCard lead={lead} today={today} />

        <section aria-labelledby="meetings-heading" className="card p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="meetings-heading" className="label-mono text-[var(--color-steel)]">
              Meetings
            </h2>
            <Link href={`/admin/calendar?lead=${lead.id}`} className="btn-quiet">
              + Schedule
            </Link>
          </div>
          {meetings.length === 0 ? (
            <p className="t-small text-[var(--color-text-dim)]">Nothing scheduled.</p>
          ) : (
            <ul className="space-y-2">
              {meetings.map((m) => {
                const day = new Date(m.startsAt);
                const dayParam = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                return (
                  <li key={m.id}>
                    <Link
                      href={`/admin/calendar?m=${dayParam.slice(0, 7)}&day=${dayParam}`}
                      className="block min-h-[var(--row-min-height)] border-l-2 border-l-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-2 transition-colors hover:bg-[var(--color-tint-hover)]"
                    >
                      <p className="text-[var(--color-text)]">{m.title}</p>
                      <p className="t-small text-[var(--color-text-muted)]">
                        <LocalDate
                          iso={m.startsAt}
                          options={m.allDay ? { weekday: "short", month: "short", day: "numeric" } : { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }}
                        />
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {!closed && (dealValue === null ? (
          <button type="button" onClick={() => setDealValue("")} disabled={isPending} className="btn btn-secondary w-full">
            Create Deal
          </button>
        ) : (
          <div className="card p-4">
            <label className="block">
              <span className="t-small mb-1 block text-[var(--color-text-muted)]">Deal value ($, optional)</span>
              <input
                type="number"
                min="0"
                step="100"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                placeholder="0"
                className="input"
                disabled={isPending}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={handleCreateDeal} disabled={isPending} className="btn btn-primary">
                {isPending ? "Creating..." : "Create"}
              </button>
              <button type="button" onClick={() => setDealValue(null)} className="btn-quiet">
                Cancel
              </button>
            </div>
          </div>
        ))}

        {lead.status !== "converted" && (
          <button type="button" onClick={handleConvert} disabled={isPending} className="btn btn-primary w-full">
            Convert to Customer
          </button>
        )}

        {/* The two judgment calls, at the bottom, away from the everyday buttons. */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-4">
          {!closed ? (
            <button type="button" onClick={handleNotAFit} disabled={isPending} className="btn-quiet">
              Mark not a fit
            </button>
          ) : (
            <span />
          )}
          {!showDeleteConfirm && (
            <button type="button" onClick={() => setShowDeleteConfirm(true)} className="btn-quiet text-[var(--color-danger)]">
              Delete lead
            </button>
          )}
        </div>
        {showDeleteConfirm && (
          <div className="rounded-[2px] border border-[var(--color-danger)] bg-[var(--color-danger-bg)] p-4">
            <p className="mb-3 text-[var(--color-danger)]">Delete this lead? This can&apos;t be undone.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleDelete} disabled={isPending} className="btn btn-danger">
                Delete
              </button>
              <button type="button" onClick={() => setShowDeleteConfirm(false)} className="btn-quiet">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
