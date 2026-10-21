"use client";

import { useState } from "react";
import Link from "next/link";
import type { CampaignRecipient } from "@/lib/store/campaigns";
import { Avatar, StatusPill } from "./ui";

type Filter = "all" | "sent" | "pending" | "replied" | "failed" | "skipped";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "replied", label: "Replied" },
  { key: "sent", label: "Sent" },
  { key: "pending", label: "Waiting" },
  { key: "failed", label: "Failed" },
  { key: "skipped", label: "Left out" },
];

function matches(r: CampaignRecipient, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "replied") return Boolean(r.repliedAt);
  if (f === "skipped") return r.status === "skipped" || r.status === "cancelled";
  return r.status === f;
}

function shortTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusOf(r: CampaignRecipient): { label: string; tone: "neutral" | "live" | "good" | "bad" | "warn" | "dim"; detail: string } {
  if (r.repliedAt) return { label: "Replied", tone: "good", detail: `Replied ${shortTime(r.repliedAt)}` };
  if (r.status === "sent") {
    if (r.followUpSentAt) return { label: "Followed up", tone: "neutral", detail: `Follow-up sent ${shortTime(r.followUpSentAt)}` };
    if (r.step === 2 && r.error) return { label: "Follow-up failed", tone: "bad", detail: r.error };
    if (r.step === 2 && r.skipReason) return { label: "Sent", tone: "neutral", detail: r.skipReason };
    return { label: "Sent", tone: "neutral", detail: r.sentAt ? `Sent ${shortTime(r.sentAt)}` : "" };
  }
  if (r.status === "pending") return { label: "Waiting", tone: "dim", detail: r.sentAt ? "Sending now" : "In the queue" };
  if (r.status === "failed") return { label: "Failed", tone: "bad", detail: r.error ?? "" };
  if (r.status === "cancelled") return { label: "Cancelled", tone: "dim", detail: "Not sent: the email was cancelled" };
  return { label: "Left out", tone: "dim", detail: r.skipReason ?? "" };
}

// Everyone on a campaign with what happened to their email: sent, replied, failed (and why), left out.
export default function RecipientTable({ recipients }: { recipients: CampaignRecipient[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(100);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, recipients.filter((r) => matches(r, f.key)).length])) as Record<Filter, number>;
  const shown = recipients.filter((r) => matches(r, filter));

  return (
    <section aria-labelledby="who" className="mt-[34px]">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="who" className="text-[17px] font-semibold text-[var(--color-text)]">
          Who got it
        </h2>
        <div className="-mx-1.5 flex flex-wrap gap-x-2" role="group" aria-label="Filter recipients">
          {FILTERS.filter((f) => f.key === "all" || counts[f.key] > 0).map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-[var(--radius-sm)] px-1.5 py-1 text-[14.5px] transition-colors hover:text-[var(--color-text)] ${
                filter === f.key ? "font-medium text-[var(--color-text)]" : "text-[var(--color-text-dim)]"
              }`}
            >
              {f.label} <span className="tabular">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>
      <ul>
        {shown.slice(0, limit).map((r) => {
          const s = statusOf(r);
          const name = r.merge.full_name || r.merge.company || r.email;
          return (
            <li key={r.id} className="grid grid-cols-[36px_minmax(0,1fr)] items-start gap-x-4 gap-y-2 border-b border-[var(--color-border)] py-4 md:grid-cols-[36px_minmax(0,1fr)_150px_minmax(0,320px)]">
              <Avatar name={name} />
              <div className="min-w-0">
                <div className="truncate text-[16px] font-semibold text-[var(--color-text)]">
                  {r.leadId ? (
                    <Link href={`/admin/leads/${r.leadId}`} className="hover:text-white">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                  {r.merge.full_name && r.merge.company && <span className="font-normal text-[var(--color-text-dim)]"> · {r.merge.company}</span>}
                </div>
                <div className="truncate text-[15px] text-[var(--color-text-muted)]">
                  {r.email}
                  {(r.subjectOverride || r.bodyOverride) && <span className="text-[var(--color-warm)]"> · written just for them</span>}
                </div>
              </div>
              <div className="col-start-2 md:col-start-auto md:pt-0.5">
                <StatusPill label={s.label} tone={s.tone} />
              </div>
              <div className={`col-start-2 min-w-0 text-[15px] md:col-start-auto md:pt-0.5 ${s.tone === "bad" ? "text-[var(--color-hot)]" : "text-[var(--color-text-muted)]"}`}>
                <span className="line-clamp-2 break-words">{s.detail}</span>
              </div>
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-10 text-center text-[15px] text-[var(--color-text-dim)]">Nobody here.</li>}
      </ul>
      {shown.length > limit && (
        <button type="button" className="btn-quiet mt-4" onClick={() => setLimit((n) => n + 200)}>
          Show more ({shown.length - limit} left)
        </button>
      )}
    </section>
  );
}
