"use client";

import Link from "next/link";
import { useMounted } from "@/components/admin/LocalDate";
import type { ActivityEntry } from "@/lib/store/activity";

const ACTION_LABEL: Record<ActivityEntry["action"], string> = {
  created: "added",
  updated: "updated",
  status_changed: "moved",
  converted: "became a customer",
  deleted: "deleted",
};

const KIND_LABEL: Record<ActivityEntry["entityType"], string> = {
  lead: "Lead",
  customer: "Customer",
  deal: "Deal",
  task: "Task",
};

// Only these actions carry a colour: a win, and something removed. Everything else stays neutral.
const DOT: Partial<Record<ActivityEntry["action"], string>> = {
  converted: "bg-[var(--color-success)]",
  deleted: "bg-[var(--color-hot)]",
};

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b\s*/gi;

/** The stored detail ("→ won", "→ customer <uuid> (deal won)") as a short readable phrase. */
function cleanDetail(action: ActivityEntry["action"], detail: string | undefined): string {
  if (!detail) return "";
  // Conversions store where the record went ("→ customer <id> (deal won)"); the sentence already says it.
  if (action === "converted") return /deal won/i.test(detail) ? "when the deal was won" : "";
  return detail.replace(UUID, "").replace(/^→\s*/, "to ").replace(/\s+/g, " ").trim();
}

function entityHref(entry: ActivityEntry): string | null {
  if (entry.action === "deleted") return null;
  if (entry.entityType === "lead") return `/admin/leads/${entry.entityId}`;
  if (entry.entityType === "deal") return `/admin/deals`;
  if (entry.entityType === "task") return `/admin/tasks`;
  return `/admin/customers`;
}

function dayHeading(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(d.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

// Grouped by the viewer's own calendar day, so it renders only after mount (the server is in UTC).
export default function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  const mounted = useMounted();
  if (!mounted) return <div aria-busy="true" className="min-h-96" />;

  const groups: { heading: string; items: ActivityEntry[] }[] = [];
  for (const entry of entries) {
    const heading = dayHeading(new Date(entry.createdAt));
    const last = groups[groups.length - 1];
    if (last?.heading === heading) last.items.push(entry);
    else groups.push({ heading, items: [entry] });
  }

  return (
    <div className="max-w-[900px] space-y-9">
      {groups.map((group) => (
        <section key={group.heading} aria-label={group.heading}>
          <h2 className="mb-1 text-[17px] font-semibold text-[var(--color-text)]">{group.heading}</h2>
          <ol className="border-t border-[var(--color-border)]">
            {group.items.map((entry) => {
              const href = entityHref(entry);
              const detail = cleanDetail(entry.action, entry.detail);
              const time = new Date(entry.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
              const body = (
                <>
                  <span className="font-semibold text-[var(--color-text)]">{entry.entityLabel}</span>
                  <span className="text-[var(--color-text-muted)]">
                    {" "}
                    {ACTION_LABEL[entry.action]}
                    {detail ? ` ${detail}` : ""}
                  </span>
                </>
              );
              return (
                <li
                  key={entry.id}
                  className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 border-b border-[var(--color-border)] py-4 sm:grid-cols-[5.5rem_minmax(0,1fr)]"
                >
                  <time dateTime={entry.createdAt} className="pt-0.5 font-mono text-sm text-[var(--color-text-dim)] tabular">
                    {time}
                  </time>
                  <div className="min-w-0">
                    <p className="relative text-base leading-snug">
                      {DOT[entry.action] && <span aria-hidden="true" className={`absolute top-2 -left-3.5 h-2 w-2 rounded-full ${DOT[entry.action]}`} />}
                      <span>
                        {href ? (
                          <Link href={href} className="decoration-[var(--color-text-dim)] underline-offset-4 hover:underline">
                            {body}
                          </Link>
                        ) : (
                          body
                        )}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-dim)]">{KIND_LABEL[entry.entityType]}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
