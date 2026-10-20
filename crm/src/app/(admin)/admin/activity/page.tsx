import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import LocalDate from "@/components/admin/LocalDate";
import { getActivityLog, type ActivityEntry } from "@/lib/store/activity";
import { humanDetail } from "@/lib/store/activityText";

const ACTION_LABEL: Record<ActivityEntry["action"], string> = {
  created: "Created",
  updated: "Updated",
  status_changed: "Status changed",
  converted: "Became a customer",
  deleted: "Removed",
};

function entityHref(entry: ActivityEntry): string | null {
  if (entry.action === "deleted") return null;
  if (entry.entityType === "lead") return `/admin/leads/${entry.entityId}`;
  if (entry.entityType === "deal") return "/admin/deals";
  if (entry.entityType === "task") return "/admin/today";
  return "/admin/customers";
}

export default async function ActivityPage() {
  const entries = await getActivityLog(100);

  return (
    <>
      <AdminHeader
        title="Activity"
        subtitle="Everything the CRM recorded, newest first."
        actions={
          <Link href="/admin/settings" className="link inline-flex min-h-[44px] items-center px-2">
            ← Settings
          </Link>
        }
      />

      {entries.length === 0 ? (
        <div className="card p-8 text-center text-base text-[var(--color-text-muted)]">
          Nothing yet. Entries appear here as leads, deals and customers are created, changed and won.
        </div>
      ) : (
        <ul className="card max-w-3xl divide-y divide-[var(--color-border)]">
          {entries.map((entry) => {
            const href = entityHref(entry);
            const content = (
              <>
                <span className="font-semibold text-[var(--color-text)]">{entry.entityLabel}</span>
                <span className="text-[var(--color-text-muted)]"> · {ACTION_LABEL[entry.action]}</span>
                {entry.detail && <span className="text-[var(--color-text-dim)]"> {humanDetail(entry.detail)}</span>}
              </>
            );
            return (
              <li key={entry.id} className="flex min-h-[56px] items-start gap-3 px-4 py-4 sm:px-5">
                <div aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--color-accent)]" />
                <div className="min-w-0 text-base">
                  {href ? (
                    <Link href={href} className="hover:underline">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                  <div className="t-small mt-0.5 text-[var(--color-text-dim)]">
                    <LocalDate iso={entry.createdAt} options={{ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
