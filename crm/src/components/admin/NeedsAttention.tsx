import Link from "next/link";
import { WEBSITE_LEAD_SOURCE, type Lead, type Task } from "@/lib/store/types";
import type { InboxRow } from "@/lib/store/messages";
import { followUpState, todayISO } from "@/lib/leads/followUp";

const MAX_PER_GROUP = 6;

interface Item {
  key: string;
  href: string;
  title: string;
  detail: string;
  badge?: { label: string; className: string };
}

function Group({ title, items, empty, more }: { title: string; items: Item[]; empty: string; more?: { href: string; count: number } }) {
  return (
    <div className="min-w-0">
      <h3 className="label-mono mb-2 flex items-center gap-2 text-[var(--color-text-muted)]">
        {title}
        {items.length > 0 && <span className="font-mono text-[var(--color-accent)]">{items.length + (more?.count ?? 0)}</span>}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--color-text-dim)]">{empty}</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {items.map((item) => (
            <li key={item.key}>
              <Link href={item.href} className="flex items-start gap-3 py-2 hover:bg-white/[0.03]">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">{item.title}</p>
                  <p className="truncate text-xs text-[var(--color-text-dim)]">{item.detail}</p>
                </div>
                {item.badge && (
                  <span className={`shrink-0 rounded-[2px] px-1.5 py-0.5 text-[11px] font-medium ${item.badge.className}`}>{item.badge.label}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {more && more.count > 0 && (
        <Link href={more.href} className="mt-1 inline-block text-xs text-[var(--color-accent)] hover:underline">
          +{more.count} more
        </Link>
      )}
    </div>
  );
}

interface NeedsAttentionProps {
  leads: Lead[];
  tasks: Task[];
  inbox: InboxRow[];
}

// The dashboard's first panel: everything that needs a person today, newest problem first.
export default function NeedsAttention({ leads, tasks, inbox }: NeedsAttentionProps) {
  const today = todayISO();

  const followUps = leads
    .filter((l) => l.followUpOn && l.followUpOn <= today && l.status !== "converted" && l.status !== "lost")
    .sort((a, b) => (a.followUpOn! < b.followUpOn! ? -1 : 1));
  const dueTasks = tasks.filter((t) => !t.done && t.dueDate && t.dueDate <= today);
  const replies = inbox.filter((r) => r.unread > 0);
  const inquiries = leads.filter((l) => l.source === WEBSITE_LEAD_SOURCE && l.status === "new");

  const total = followUps.length + dueTasks.length + replies.length + inquiries.length;

  const toItems = {
    followUps: followUps.slice(0, MAX_PER_GROUP).map<Item>((l) => ({
      key: l.id,
      href: `/admin/leads/${l.id}`,
      title: l.businessName,
      detail: l.nextAction || "Follow up",
      badge: followUpState(l.followUpOn, today) ?? undefined,
    })),
    tasks: dueTasks.slice(0, MAX_PER_GROUP).map<Item>((t) => ({
      key: t.id,
      href: t.relatedType === "lead" && t.relatedId ? `/admin/leads/${t.relatedId}` : "/admin/tasks",
      title: t.title,
      detail: t.relatedLabel ?? "Task",
      badge: followUpState(t.dueDate, today) ?? undefined,
    })),
    replies: replies.slice(0, MAX_PER_GROUP).map<Item>((r) => ({
      key: r.leadId,
      href: `/admin/leads/${r.leadId}#messages`,
      title: r.businessName,
      detail: r.lastSnippet || r.lastSubject,
      badge: { label: `${r.unread} new`, className: "bg-[var(--color-accent)]/15 text-[var(--color-accent)]" },
    })),
    inquiries: inquiries.slice(0, MAX_PER_GROUP).map<Item>((l) => ({
      key: l.id,
      href: `/admin/leads/${l.id}`,
      title: l.businessName,
      detail: l.email || l.notes.split("\n")[0] || "Website inquiry",
    })),
  };

  return (
    <section
      aria-labelledby="attention-heading"
      className="relative mb-4 rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6"
    >
      <div aria-hidden="true" className="absolute top-[-1px] left-6 flex h-[3px] w-24">
        <span className="flex-[5] bg-[var(--color-accent)]" />
        <span className="flex-[3] bg-[var(--color-livery-orange)]" />
        <span className="flex-[2] bg-[var(--color-livery-red)]" />
      </div>
      <div className="mb-5 flex items-baseline justify-between">
        <h2 id="attention-heading" className="label-mono text-[var(--color-steel)]">
          Needs attention
        </h2>
        <span className="text-xs text-[var(--color-text-dim)]">{total === 0 ? "All clear" : `${total} today`}</span>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <Group title="Replies" items={toItems.replies} empty="No unread replies." more={{ href: "/admin/inbox", count: replies.length - toItems.replies.length }} />
        <Group title="Follow-ups due" items={toItems.followUps} empty="Nothing due." more={{ href: "/admin/leads", count: followUps.length - toItems.followUps.length }} />
        <Group title="Tasks due" items={toItems.tasks} empty="No tasks due." more={{ href: "/admin/tasks", count: dueTasks.length - toItems.tasks.length }} />
        <Group
          title="Website inquiries"
          items={toItems.inquiries}
          empty="No new inquiries."
          more={{ href: "/admin/leads?status=new", count: inquiries.length - toItems.inquiries.length }}
        />
      </div>
    </section>
  );
}
