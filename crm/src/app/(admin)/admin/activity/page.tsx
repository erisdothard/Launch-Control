import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { getActivityLog, type ActivityEntry } from "@/lib/store/activity";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const ACTION_LABEL: Record<ActivityEntry["action"], string> = {
  created: "Created",
  updated: "Updated",
  status_changed: "Status changed",
  converted: "Converted to customer",
  deleted: "Deleted",
};

function entityHref(entry: ActivityEntry): string | null {
  if (entry.action === "deleted") return null;
  if (entry.entityType === "lead") return `/admin/leads/${entry.entityId}`;
  if (entry.entityType === "deal") return `/admin/deals`;
  if (entry.entityType === "task") return `/admin/tasks`;
  return `/admin/customers`;
}

export default async function ActivityPage() {
  const entries = await getActivityLog(100);

  return (
    <>
      <AdminHeader title="Activity Log" subtitle="Every touch, automatically recorded." />

      {entries.length === 0 ? (
        <div className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 text-center text-[var(--color-text-muted)]">
          No activity yet — it&apos;ll show up here as leads get created, updated, and converted.
        </div>
      ) : (
        <div className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
          <ul className="space-y-4">
            {entries.map((entry) => {
              const href = entityHref(entry);
              const content = (
                <>
                  <span className="font-medium text-[var(--color-text)]">{entry.entityLabel}</span>
                  <span className="text-[var(--color-text-muted)]"> — {ACTION_LABEL[entry.action]}</span>
                  {entry.detail && <span className="text-[var(--color-text-dim)]"> {entry.detail}</span>}
                </>
              );
              return (
                <li key={entry.id} className="flex items-start gap-3 border-b border-[var(--color-border)] pb-4 text-sm last:border-0 last:pb-0">
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
                  <div>
                    {href ? (
                      <Link href={href} className="hover:underline">
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                    <div className="text-xs text-[var(--color-text-dim)]">{formatDateTime(entry.createdAt)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
