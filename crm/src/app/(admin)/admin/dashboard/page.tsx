import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { getLeads } from "@/lib/store/leads";
import { getCustomers } from "@/lib/store/customers";
import { getActivityLog } from "@/lib/store/activity";
import { LEAD_STATUSES, type LeadStatus, type ActivityEntry } from "@/lib/store/types";
import { getLeadsGeneratedThisMonth } from "@/lib/leadgen/stats";

// Solid versions of StatusBadge's hue families — badges use light tints,
// this needs to read at a glance in a thin bar.
const STATUS_BAR_COLORS: Record<LeadStatus, string> = {
  new: "bg-[var(--color-steel)]",
  contacted: "bg-amber-400",
  qualified: "bg-teal-400",
  proposal: "bg-purple-400",
  negotiation: "bg-[var(--color-livery-orange)]",
  converted: "bg-[var(--color-accent)]",
  lost: "bg-[var(--color-livery-red)]",
};

const ACTION_META: Record<ActivityEntry["action"], { label: string; dot: string }> = {
  created: { label: "created", dot: "bg-[var(--color-steel)]" },
  updated: { label: "updated", dot: "bg-[var(--color-text-dim)]" },
  status_changed: { label: "moved", dot: "bg-amber-400" },
  converted: { label: "converted", dot: "bg-[var(--color-accent)]" },
  deleted: { label: "removed", dot: "bg-red-400" },
};

function formatRelativeTime(iso: string): string {
  const diffMinutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Numbers take the livery colours in turn, as the site's numbered items do.
const LIVERY_TEXT = ["text-[var(--color-accent)]", "text-[var(--color-livery-orange)]", "text-[var(--color-livery-red)]"] as const;

function StatCard({ label, value, href, index }: { label: string; value: number; href: string; index: number }) {
  return (
    <Link
      href={href}
      className="group rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 transition-colors hover:border-[var(--color-border-bright)]"
    >
      <p className="label-mono text-[var(--color-text-muted)]">{label}</p>
      <p className={`mt-2 font-mono text-3xl tabular-nums ${LIVERY_TEXT[index % LIVERY_TEXT.length]}`}>
        {value}
      </p>
    </Link>
  );
}

function startOfLastWeek(): number {
  return Date.now() - 7 * 24 * 60 * 60 * 1000;
}

export default async function DashboardPage() {
  const [leads, customers, activity] = await Promise.all([getLeads(), getCustomers(), getActivityLog(8)]);

  const weekAgoMs = startOfLastWeek();
  const newThisWeek = leads.filter((l) => new Date(l.createdAt).getTime() >= weekAgoMs).length;
  const converted = leads.filter((l) => l.status === "converted").length;
  const conversionRate = leads.length ? Math.round((converted / leads.length) * 100) : 0;
  const activePipeline = leads.filter((l) => l.status !== "converted" && l.status !== "lost").length;
  const newLeads = leads.filter((l) => l.status === "new").length;
  const leadGenStats = getLeadsGeneratedThisMonth(leads);
  const hotUncontacted = leads.filter((l) => (l.prospect?.score ?? 0) >= 80 && l.status === "new").length;

  const statusCounts = LEAD_STATUSES.map((status) => ({
    status,
    count: leads.filter((l) => l.status === status).length,
  }));

  return (
    <>
      <AdminHeader title="Dashboard" subtitle="Pipeline overview and lead activity at a glance." />

      <div className="mb-4 flex flex-col gap-4 rounded-[2px] border border-[var(--color-accent)]/30 bg-[var(--color-bg-card)] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="label-mono text-[var(--color-accent)]">
            Automated Lead Gen
          </p>
          <p className="mt-2 font-mono text-6xl tabular-nums text-[var(--color-steel)]">{leadGenStats.count}</p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            new prospects found and scored in <span className="font-medium text-[var(--color-text)]">{leadGenStats.monthLabel}</span>
          </p>
        </div>
        <Link
          href="/admin/lead-gen?min=80&status=new"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[2px] bg-[var(--color-accent)] px-4 py-2.5 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          {hotUncontacted} hot prospects to contact →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="label-mono text-[var(--color-text-muted)]">Total Leads</p>
              <p className="mt-2 font-mono text-5xl tabular-nums text-[var(--color-steel)]">{leads.length}</p>
            </div>
            {newThisWeek > 0 && (
              <span className="rounded-full bg-[var(--color-accent)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--color-accent)]">
                +{newThisWeek} this week
              </span>
            )}
          </div>

          <div className="mt-6">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-secondary)]">
              {leads.length > 0 &&
                statusCounts.map(({ status, count }) =>
                  count > 0 ? (
                    <div
                      key={status}
                      className={`h-full ${STATUS_BAR_COLORS[status]}`}
                      style={{ width: `${(count / leads.length) * 100}%` }}
                      title={`${status}: ${count}`}
                    />
                  ) : null
                )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {statusCounts.map(({ status, count }) => (
                <div key={status} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_BAR_COLORS[status]}`} />
                  <span className="capitalize">{status}</span>
                  <span className="font-medium text-[var(--color-text)]">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 text-center">
          <div
            className="relative flex h-28 w-28 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(var(--color-accent) ${conversionRate * 3.6}deg, var(--color-bg-secondary) 0deg)`,
            }}
          >
            <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-[var(--color-bg-card)]">
              <span className="font-mono text-2xl tabular-nums text-[var(--color-steel)]">{conversionRate}%</span>
            </div>
          </div>
          <p className="mt-4 text-sm font-medium text-[var(--color-text)]">Conversion Rate</p>
          <p className="text-xs text-[var(--color-text-dim)]">
            {converted} of {leads.length} converted
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard index={0} label="Active Pipeline" value={activePipeline} href="/admin/leads" />
        <StatCard index={1} label="New Leads" value={newLeads} href="/admin/leads?status=new" />
        <StatCard index={2} label="Customers" value={customers.length} href="/admin/customers" />
      </div>

      <div className="mt-4 rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="label-mono text-[var(--color-steel)]">Recent Activity</h2>
          <Link href="/admin/activity" className="text-xs font-medium text-[var(--color-accent)] hover:underline">
            View all
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="text-sm text-[var(--color-text-dim)]">
            Nothing yet — activity shows up here as leads move through the pipeline.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {activity.map((entry) => {
              const meta = ACTION_META[entry.action];
              return (
                <li key={entry.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">
                    <span className="font-medium">{entry.entityLabel}</span>{" "}
                    <span className="text-[var(--color-text-muted)]">
                      {meta.label}
                      {entry.detail ? ` ${entry.detail}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--color-text-dim)]">
                    {formatRelativeTime(entry.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
