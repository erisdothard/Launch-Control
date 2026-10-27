import Link from "next/link";
import type { InboxFolder } from "@/lib/store/messages";
import { ArchiveIcon, DraftIcon, InboxIcon, PenIcon, ReplyNeededIcon, SentIcon } from "./icons";
import { inboxHref } from "./url";

export interface FolderCounts {
  unread: number;
  needsReply: number;
  drafts: number;
}

const ITEMS: { folder: InboxFolder; label: string; icon: React.ReactNode; count?: keyof FolderCounts }[] = [
  { folder: "inbox", label: "Inbox", icon: <InboxIcon />, count: "unread" },
  { folder: "needs", label: "Replies needed", icon: <ReplyNeededIcon />, count: "needsReply" },
  { folder: "drafts", label: "Drafts", icon: <DraftIcon />, count: "drafts" },
  { folder: "sent", label: "Sent", icon: <SentIcon /> },
  { folder: "archive", label: "Archive", icon: <ArchiveIcon /> },
];

interface FolderNavProps {
  folder: InboxFolder;
  counts: FolderCounts;
  demo: boolean;
  /** Compose is the main action only while nothing else on screen is. */
  composePrimary: boolean;
}

/** Desktop: the left column. Compose on top, folders under it. */
export function FolderColumn({ folder, counts, demo, composePrimary }: FolderNavProps) {
  return (
    <nav aria-label="Mail folders" className="flex flex-col gap-1">
      <Link href={inboxHref({ folder, compose: true, demo })} scroll={false} className={`btn ${composePrimary ? "btn-primary" : "btn-secondary"} mb-2 w-full`}>
        <PenIcon />
        Compose
      </Link>
      <Link href="/admin/campaigns/new" className="btn-quiet mb-5 px-3 py-1.5 text-[15px]">
        New campaign
      </Link>
      {ITEMS.map((item) => {
        const on = item.folder === folder;
        const n = item.count ? counts[item.count] : 0;
        return (
          <Link
            key={item.folder}
            href={inboxHref({ folder: item.folder, demo })}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className={`relative flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-[15px] transition-colors ${
              on ? "bg-[var(--color-bg-card)] text-[var(--color-text)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]"
            }`}
          >
            {item.icon}
            <span className="flex-1 whitespace-nowrap">{item.label}</span>
            {n > 0 && (
              <span
                className={`tabular text-[14px] ${
                  item.folder === "needs" ? "rounded-full bg-[var(--color-livery-red)] px-2 font-medium text-white" : "text-[var(--color-text-dim)]"
                }`}
              >
                {n}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phones and narrow screens: the folders as a scrolling row of chips above the list. */
export function FolderChips({ folder, counts, demo }: Omit<FolderNavProps, "composePrimary">) {
  return (
    <nav aria-label="Mail folders" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-2">
        {ITEMS.map((item) => {
          const on = item.folder === folder;
          const n = item.count ? counts[item.count] : 0;
          return (
            <li key={item.folder}>
              <Link
                href={inboxHref({ folder: item.folder, demo })}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={`flex h-10 items-center gap-2 rounded-full px-4 text-[15px] whitespace-nowrap transition-colors ${
                  on
                    ? "bg-[var(--color-steel)] text-[var(--color-on-accent)]"
                    : "text-[var(--color-text-muted)] shadow-[inset_0_0_0_1px_var(--color-border-bright)] hover:text-[var(--color-text)]"
                }`}
              >
                {item.label}
                {n > 0 && <span className="tabular font-semibold">{n}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
