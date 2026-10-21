import AdminHeader from "@/components/admin/AdminHeader";
import Composer from "@/components/inbox/Composer";
import DraftPane from "@/components/inbox/DraftPane";
import { FolderChips, FolderColumn } from "@/components/inbox/FolderNav";
import ReadingPane from "@/components/inbox/ReadingPane";
import SearchBox from "@/components/inbox/SearchBox";
import { DraftRows, ThreadRows } from "@/components/inbox/ThreadList";
import { DEMO_ACCOUNTS, DEMO_COUNTS, DEMO_DRAFTS, demoConversation, demoLead, demoThreads } from "@/components/inbox/demo";
import { BackIcon } from "@/components/inbox/icons";
import { countWord, inboxHref, parseFolder } from "@/components/inbox/url";
import Link from "next/link";
import { getPendingDrafts } from "@/lib/store/drafts";
import {
  getConversation,
  getEmailAccounts,
  getInboxCounts,
  getInboxPage,
  getThread,
  getThreadLead,
  type EmailAccount,
  type InboxCounts,
  type InboxPage,
} from "@/lib/store/messages";

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// Max's own mailbox first (not an alias row), then any active Outlook, then whatever is connected.
function primaryAccount(accounts: EmailAccount[]): string {
  const active = accounts.filter((a) => a.status === "active");
  return (active.find((a) => a.provider === "outlook" && !a.mailbox) ?? active.find((a) => a.provider === "outlook") ?? active[0])?.id ?? "";
}

function lede(needs: number, drafts: number): string {
  const people = needs === 1 ? "One person is" : `${countWord(needs)} people are`;
  const ready = drafts === 1 ? "one draft is" : `${countWord(drafts).toLowerCase()} drafts are`;
  if (needs && drafts) return `${people} waiting on a reply, and ${ready} ready to send. Start at the top of Needs reply.`;
  if (needs) return `${people} waiting on a reply. Start at the top of Needs reply.`;
  if (drafts) return `Nobody is waiting on you. ${ready.charAt(0).toUpperCase()}${ready.slice(1)} ready to check and send.`;
  return "You're caught up. New mail lands here within a couple of minutes.";
}

export default async function InboxPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  // Sample data for design review, never in production.
  const demo = one(sp.demo) === "1" && process.env.NODE_ENV !== "production";
  const folder = parseFolder(one(sp.folder));
  const q = one(sp.q).slice(0, 80);
  const page = Math.max(0, Math.min(40, Number.parseInt(one(sp.page), 10) || 0));
  const thread = one(sp.thread).slice(0, 300);
  const draftId = one(sp.draft);
  const compose = one(sp.compose) === "1";

  const [accounts, drafts, listing, conversation] = await Promise.all([
    demo ? DEMO_ACCOUNTS : getEmailAccounts(),
    demo ? DEMO_DRAFTS : getPendingDrafts(),
    folder === "drafts"
      ? null
      : demo
        ? ({ threads: demoThreads(folder), counts: DEMO_COUNTS, hasMore: false } satisfies InboxPage)
        : getInboxPage(folder, { q, page }),
    thread ? (demo ? demoConversation(thread) : getConversation(thread)) : null,
  ]);
  const counts: InboxCounts = listing?.counts ?? (demo ? DEMO_COUNTS : await getInboxCounts());
  const leadId = conversation?.find((m) => m.leadId)?.leadId ?? null;
  const lead = demo ? demoLead(leadId) : leadId ? await getThreadLead(leadId) : null;
  const draft = draftId ? drafts.find((d) => d.id === draftId) : undefined;

  const primary = primaryAccount(accounts);
  // A draft goes out as whoever last wrote on its lead's conversation; otherwise Max.
  let draftAccount = primary;
  if (draft && !demo) {
    const lastOut = [...(await getThread(draft.leadId))].reverse().find((m) => m.direction === "out" && m.accountId);
    if (lastOut?.accountId && accounts.some((a) => a.id === lastOut.accountId)) draftAccount = lastOut.accountId;
  }

  const listHref = inboxHref({ folder, q, page, demo });
  const open = Boolean(conversation || draft || compose);
  const folderCounts = { ...counts, drafts: drafts.length };

  let reading: React.ReactNode;
  if (compose) {
    reading = (
      <div className="px-3 py-5 sm:px-6">
        <div className="mb-4 flex items-center gap-3 px-2">
          <Link href={listHref} scroll={false} className="btn btn-secondary btn-sm -ml-1 lg:hidden" aria-label="Back to the list">
            <BackIcon />
            Back
          </Link>
          <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-[var(--color-text)] sm:text-[24px]">New email</h2>
          <Link href={listHref} scroll={false} className="btn-quiet ml-auto hidden text-[15px] lg:inline">
            Close
          </Link>
        </div>
        <Composer
          mode="new"
          accounts={accounts}
          defaultAccountId={primary}
          initial={{ to: "", cc: "", bcc: "", subject: "", body: "" }}
          storageKey={demo ? undefined : "lc-inbox:new"}
          demo={demo}
          searchLeads
          autoFocus
        />
        <p className="mt-4 px-2 text-[15px] text-[var(--color-text-muted)]">
          Writing to many people at once?{" "}
          <Link href="/admin/campaigns/new" className="btn-quiet text-[15px] text-[var(--color-text)]">
            Use Mass email
          </Link>
          . Each person gets their own copy.
        </p>
      </div>
    );
  } else if (draft) {
    reading = <DraftPane draft={draft} accounts={accounts} defaultAccountId={draftAccount} backHref={listHref} demo={demo} />;
  } else if (conversation) {
    reading = (
      <ReadingPane
        key={thread}
        threadKey={thread}
        messages={conversation}
        lead={lead}
        accounts={accounts}
        defaultAccountId={primary}
        backHref={listHref}
        archived={folder === "archive" || (conversation.length > 0 && conversation.every((m) => m.folder === "archive"))}
        demo={demo}
      />
    );
  } else {
    reading = (
      <div className="grid h-full min-h-[420px] place-items-center p-10 text-center">
        <div>
          <p className="text-[18px] text-[var(--color-text)]">{draftId || thread ? "That one was sent, moved or removed." : "Pick a conversation to read it."}</p>
          <p className="mt-2 text-[15px] text-[var(--color-text-muted)]">Replies, drafts and new mail all start from here.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={open ? "hidden lg:block" : undefined}>
        <AdminHeader title="Inbox" subtitle={lede(counts.needsReply, drafts.length)} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:h-[calc(100dvh-15rem)] lg:min-h-[560px] lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] xl:grid-cols-[188px_minmax(320px,336px)_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <FolderColumn folder={folder} counts={folderCounts} demo={demo} composePrimary={!open} />
        </aside>

        <section aria-label="Conversations" className={`${open ? "hidden lg:flex" : "flex"} min-h-0 min-w-0 flex-col`}>
          <div className="mb-4 flex items-center gap-3 xl:hidden">
            <Link href={inboxHref({ folder, compose: true, demo })} scroll={false} className="btn btn-primary btn-sm">
              Compose
            </Link>
            <Link href="/admin/campaigns/new" className="btn btn-secondary btn-sm">
              Mass email
            </Link>
          </div>
          <div className="mb-4 xl:hidden">
            <FolderChips folder={folder} counts={folderCounts} demo={demo} />
          </div>
          <SearchBox placeholder={folder === "drafts" ? "Search drafts" : "Search mail"} />
          <div className="mt-3 -mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
            {folder === "drafts" ? (
              <DraftRows drafts={drafts} selected={draftId} q={q} demo={demo} />
            ) : (
              <ThreadRows threads={listing?.threads ?? []} selected={thread} folder={folder} q={q} page={page} demo={demo} hasMore={listing?.hasMore ?? false} />
            )}
          </div>
        </section>

        <section aria-label="Reading pane" className={`${open ? "block" : "hidden lg:block"} card min-h-0 min-w-0 overflow-y-auto`}>
          {reading}
        </section>
      </div>
    </>
  );
}
