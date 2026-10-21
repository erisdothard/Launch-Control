import Link from "next/link";
import LocalTime from "@/components/admin/LocalTime";
import type { EmailDraft } from "@/lib/store/drafts";
import type { InboxFolder, ThreadSummary } from "@/lib/store/messages";
import Avatar from "./Avatar";
import { PaperclipIcon } from "./icons";
import { inboxHref } from "./url";

interface ListProps {
  folder: InboxFolder;
  q: string;
  page: number;
  demo: boolean;
}

const EMPTY: Record<InboxFolder, string> = {
  inbox: "Nothing in the Inbox. New mail shows up here within a couple of minutes.",
  needs: "Nobody is waiting on a reply. Nice work.",
  drafts: "No drafts waiting. When a lead writes back, a reply is drafted here for you to check.",
  sent: "Nothing sent yet.",
  archive: "Nothing archived. Archive a conversation to clear it out of the Inbox.",
};

function Empty({ text }: { text: string }) {
  return <p className="px-2 py-10 text-center text-[16px] leading-relaxed text-[var(--color-text-muted)]">{text}</p>;
}

// The row's left mark: a filled dot while unread.
function UnreadDot({ on }: { on: boolean }) {
  return <span aria-hidden="true" className={`mt-[17px] h-2 w-2 shrink-0 rounded-full ${on ? "bg-[var(--color-accent)]" : ""}`} />;
}

function rowClass(selected: boolean) {
  return `group relative flex gap-3 rounded-[var(--radius-md)] py-4 pr-3 pl-2 transition-colors ${
    selected ? "bg-[var(--color-bg-card)]" : "hover:bg-[var(--color-bg-hover)]"
  }`;
}

export function ThreadRows({ threads, selected, folder, q, page, demo, hasMore }: ListProps & { threads: ThreadSummary[]; selected?: string; hasMore: boolean }) {
  if (!threads.length) return <Empty text={q ? `Nothing matches "${q}".` : EMPTY[folder]} />;
  return (
    <>
      <ul className="divide-y divide-[var(--color-border)]">
        {threads.map((t) => {
          const isSel = t.key === selected;
          const unread = t.unread > 0;
          return (
            <li key={t.key}>
              <Link href={inboxHref({ folder, q, page, thread: t.key, demo })} scroll={false} aria-current={isSel ? "true" : undefined} className={rowClass(isSel)}>
                {isSel && <span aria-hidden="true" className="absolute top-3 bottom-3 -left-[1px] w-[3px] rounded-r bg-[var(--color-steel)]" />}
                <UnreadDot on={unread} />
                <Avatar name={t.name} seed={t.address} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <p className={`min-w-0 flex-1 truncate text-[16px] ${unread ? "font-semibold text-[var(--color-text)]" : "font-medium text-[var(--color-text)]"}`}>
                      {t.name}
                      {t.count > 1 && <span className="ml-1.5 text-[14px] font-normal text-[var(--color-text-dim)]">{t.count}</span>}
                    </p>
                    <span className="shrink-0 text-[14px] text-[var(--color-text-dim)]">
                      <LocalTime iso={t.lastAt} />
                    </span>
                  </div>
                  <p className={`mt-0.5 truncate text-[15px] ${unread ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}>{t.subject || "(no subject)"}</p>
                  <p className="mt-0.5 line-clamp-2 text-[14px] leading-[1.45] text-[var(--color-text-dim)]">
                    {t.lastDirection === "out" && !t.snippet.startsWith("You:") ? "You: " : ""}
                    {t.snippet}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[14px]">
                    {t.leadId ? (
                      <span className="inline-flex items-center gap-1.5 text-[var(--color-text-muted)]">
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
                        {t.businessName ?? "Lead"}
                      </span>
                    ) : (
                      <span className="text-[var(--color-text-dim)]">Not a lead</span>
                    )}
                    {t.hasAttachments && (
                      <span className="inline-flex items-center gap-1 text-[var(--color-text-dim)]" title="Has attachments">
                        <PaperclipIcon size={15} />
                        <span className="sr-only">Has attachments</span>
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <Pager folder={folder} q={q} page={page} demo={demo} hasMore={hasMore} />
    </>
  );
}

function Pager({ folder, q, page, demo, hasMore }: ListProps & { hasMore: boolean }) {
  if (!hasMore && page === 0) return null;
  return (
    <div className="flex items-center justify-between px-2 py-5 text-[15px]">
      {page > 0 ? (
        <Link className="btn-quiet" href={inboxHref({ folder, q, page: page - 1, demo })} scroll={false}>
          Newer
        </Link>
      ) : (
        <span />
      )}
      {hasMore && (
        <Link className="btn-quiet" href={inboxHref({ folder, q, page: page + 1, demo })} scroll={false}>
          Older
        </Link>
      )}
    </div>
  );
}

export function DraftRows({ drafts, selected, q, demo }: { drafts: EmailDraft[]; selected?: string; q: string; demo: boolean }) {
  const term = q.toLowerCase();
  const shown = term
    ? drafts.filter((d) => [d.subject, d.body, d.to, d.businessName, d.contactName ?? ""].some((v) => v.toLowerCase().includes(term)))
    : drafts;
  if (!shown.length) return <Empty text={q ? `No drafts match "${q}".` : EMPTY.drafts} />;
  return (
    <ul className="divide-y divide-[var(--color-border)]">
      {shown.map((d) => {
        const isSel = d.id === selected;
        const who = d.contactName || d.businessName;
        return (
          <li key={d.id}>
            <Link href={inboxHref({ folder: "drafts", q, draft: d.id, demo })} scroll={false} aria-current={isSel ? "true" : undefined} className={rowClass(isSel)}>
              {isSel && <span aria-hidden="true" className="absolute top-3 bottom-3 -left-[1px] w-[3px] rounded-r bg-[var(--color-steel)]" />}
              <UnreadDot on={false} />
              <Avatar name={who} seed={d.to} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-3">
                  <p className="min-w-0 flex-1 truncate text-[16px] font-medium text-[var(--color-text)]">
                    {who}
                    {d.contactName && <span className="font-normal text-[var(--color-text-muted)]"> · {d.businessName}</span>}
                  </p>
                  <span className="shrink-0 text-[14px] text-[var(--color-text-dim)]">
                    <LocalTime iso={d.createdAt} />
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[15px] text-[var(--color-text-muted)]">{d.subject}</p>
                <p className="mt-0.5 line-clamp-2 text-[14px] leading-[1.45] text-[var(--color-text-dim)]">{d.body.replace(/\s+/g, " ")}</p>
                <div className="mt-2 flex items-center gap-3 text-[14px]">
                  <span className={d.kind === "reply" ? "font-medium text-[var(--color-hot)]" : "font-medium text-[var(--color-warm)]"}>
                    {d.kind === "reply" ? "Reply drafted" : `Follow-up ${d.followUpNumber ?? ""} drafted`.replace("  ", " ")}
                  </span>
                  {d.error && <span className="text-[var(--color-hot)]">Last try failed</span>}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
