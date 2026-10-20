import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { getInbox } from "@/lib/store/messages";
import LocalTime from "@/components/admin/LocalTime";

export default async function InboxPage() {
  const rows = await getInbox();
  const unread = rows.reduce((sum, r) => sum + r.unread, 0);

  return (
    <>
      <AdminHeader
        title="Inbox"
        subtitle={rows.length ? `${rows.length} conversation${rows.length === 1 ? "" : "s"} · ${unread} unread` : "Every email thread with a lead, newest first."}
      />
      {rows.length === 0 ? (
        <div className="rounded-[2px] border border-dashed border-[var(--color-border-bright)] bg-[var(--color-bg-card)] p-6 text-sm text-[var(--color-text-muted)]">
          No conversations yet. Open a lead and send the first email from its Messages panel.
        </div>
      ) : (
        <ul className="overflow-hidden rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)]">
          {rows.map((r) => (
            <li key={r.leadId} className="border-b border-[var(--color-border)] last:border-0">
              <Link
                href={`/admin/leads/${r.leadId}#messages`}
                className="flex items-start gap-4 px-4 py-4 transition-colors hover:bg-white/[0.03] sm:px-5"
              >
                <span
                  aria-hidden="true"
                  className={`mt-2 h-2 w-2 shrink-0 rounded-full ${r.unread ? "bg-[var(--color-accent)]" : "bg-transparent"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={`truncate ${r.unread ? "font-semibold text-[var(--color-text)]" : "font-medium text-[var(--color-text)]"}`}>
                      {r.businessName}
                      {r.contactName && <span className="font-normal text-[var(--color-text-muted)]"> · {r.contactName}</span>}
                    </p>
                    <span className="shrink-0 font-mono text-xs text-[var(--color-text-dim)]"><LocalTime iso={r.lastAt} /></span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-[var(--color-text-muted)]">{r.lastSubject || "(no subject)"}</p>
                  <p className="mt-0.5 line-clamp-1 text-sm text-[var(--color-text-dim)]">
                    {r.lastDirection === "out" ? "You: " : ""}
                    {r.lastSnippet}
                  </p>
                </div>
                {r.unread > 0 && (
                  <span className="mt-0.5 shrink-0 rounded-[2px] bg-[var(--color-accent)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-on-accent)]">
                    {r.unread}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
