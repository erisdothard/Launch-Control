"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/admin/StatusBadge";
import { LEAD_STATUSES, type Lead, type ActivityEntry } from "@/lib/store/types";
import { FactorBars, SignalChips } from "@/components/admin/ProspectInsights";
import { scoreBand } from "@/lib/leadgen/factors";
import {
  updateLeadStatusAction,
  updateLeadAction,
  deleteLeadAction,
  convertLeadAction,
} from "../actions";

const inputClass =
  "w-full rounded-[2px] border border-transparent bg-[var(--color-bg-secondary)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/30";
const labelClass = "mb-1.5 block text-sm font-medium text-[var(--color-text-muted)]";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const ACTION_LABEL: Record<ActivityEntry["action"], string> = {
  created: "Created",
  updated: "Updated",
  status_changed: "Status changed",
  converted: "Converted to customer",
  deleted: "Deleted",
};

interface LeadDetailClientProps {
  lead: Lead;
  activity: ActivityEntry[];
}


export default function LeadDetailClient({ lead, activity }: LeadDetailClientProps) {
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

  function handleStatusChange(status: string) {
    startTransition(async () => {
      await updateLeadStatusAction(lead.id, status as Lead["status"]);
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

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusBadge status={lead.status} variant="lead" />
              <select
                value={lead.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={isPending}
                className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] capitalize outline-none focus:border-[var(--color-accent)]/50"
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            {!editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-sm font-medium text-[var(--color-accent)] hover:underline"
              >
                Edit
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Business name</label>
                <input
                  value={form.businessName}
                  onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Email</label>
                  <input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={4}
                  className={inputClass}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isPending}
                  className="rounded-[2px] bg-[var(--color-accent)] px-4 py-2 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm({ businessName: lead.businessName, email: lead.email, phone: lead.phone, notes: lead.notes });
                    setEditing(false);
                  }}
                  className="rounded-[2px] px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-white/[0.05]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <dl className="space-y-4 text-sm">
              <div className="flex justify-between border-b border-[var(--color-border)] pb-3">
                <dt className="text-[var(--color-text-dim)]">Email</dt>
                <dd className="text-[var(--color-text)]">{lead.email || "—"}</dd>
              </div>
              <div className="flex justify-between border-b border-[var(--color-border)] pb-3">
                <dt className="text-[var(--color-text-dim)]">Phone</dt>
                <dd className="text-[var(--color-text)]">{lead.phone || "—"}</dd>
              </div>
              {lead.prospect?.website && /^https?:\/\//.test(lead.prospect.website) && (
                <div className="flex justify-between gap-4 border-b border-[var(--color-border)] pb-3">
                  <dt className="text-[var(--color-text-dim)]">Website</dt>
                  <dd className="truncate">
                    <a href={lead.prospect.website} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">
                      {lead.prospect.domain ?? lead.prospect.website}
                    </a>
                  </dd>
                </div>
              )}
              <div className="flex justify-between border-b border-[var(--color-border)] pb-3">
                <dt className="text-[var(--color-text-dim)]">Source</dt>
                <dd className="text-[var(--color-text)]">{lead.source || "—"}</dd>
              </div>
              <div>
                <dt className="mb-1.5 text-[var(--color-text-dim)]">Notes</dt>
                <dd className="whitespace-pre-wrap text-[var(--color-text)]">{lead.notes || "No notes yet."}</dd>
              </div>
            </dl>
          )}
        </div>

        {lead.prospect && (
          <div className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--color-text)]">Lead-gen fit</h2>
                <p className="mt-0.5 text-xs text-[var(--color-text-dim)]">
                  {[lead.prospect.segment, [lead.prospect.city, lead.prospect.state].filter(Boolean).join(", ")]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {lead.prospect.score !== null && (
                <span className={`rounded-[2px] px-2.5 py-1 text-sm font-semibold tabular-nums ${scoreBand(lead.prospect.score)?.className ?? ""}`}>
                  {lead.prospect.score} · {scoreBand(lead.prospect.score)?.label}
                </span>
              )}
            </div>
            <dl className="mb-5 space-y-3 text-sm">
              {lead.prospect.contactName && (
                <div>
                  <dt className="text-xs text-[var(--color-text-dim)]">Decision-maker</dt>
                  <dd className="text-[var(--color-text)]">
                    {lead.prospect.contactName}
                    {lead.prospect.contactTitle && <span className="text-[var(--color-text-muted)]"> · {lead.prospect.contactTitle}</span>}
                  </dd>
                </div>
              )}
              {lead.prospect.scoreReason && (
                <div>
                  <dt className="text-xs text-[var(--color-text-dim)]">Why</dt>
                  <dd className="text-[var(--color-text)]">{lead.prospect.scoreReason}</dd>
                </div>
              )}
              {lead.prospect.outreachHook && (
                <div>
                  <dt className="text-xs text-[var(--color-text-dim)]">Opening angle</dt>
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

        <div className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
          <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">Activity</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {activity.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
                  <div>
                    <span className="text-[var(--color-text)]">{ACTION_LABEL[entry.action]}</span>
                    {entry.detail && <span className="text-[var(--color-text-muted)]"> {entry.detail}</span>}
                    <div className="text-xs text-[var(--color-text-dim)]">{formatDateTime(entry.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={handleConvert}
          disabled={isPending || lead.status === "converted"}
          className="w-full rounded-[2px] bg-[var(--color-accent)] px-4 py-2.5 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {lead.status === "converted" ? "Already converted" : "Convert to Customer"}
        </button>

        {showDeleteConfirm ? (
          <div className="rounded-[2px] border border-red-400/30 bg-red-400/10 p-4">
            <p className="mb-3 text-sm text-red-300">Delete this lead? This can&apos;t be undone.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="rounded-[2px] bg-[var(--color-danger)] px-3 py-1.5 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] hover:bg-red-500"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-[2px] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] hover:bg-white/[0.05]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-400/10"
          >
            Delete Lead
          </button>
        )}
      </div>
    </div>
  );
}
