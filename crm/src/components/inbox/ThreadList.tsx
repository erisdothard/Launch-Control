"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LocalTime from "@/components/admin/LocalTime";
import type { EmailDraft } from "@/lib/store/drafts";
import type { InboxFolder, ThreadSummary } from "@/lib/store/messages";
import Avatar from "./Avatar";
import { Check } from "@/components/compose/ui";
import type { BulkMailOp } from "@/lib/store/messages";
import { bulkInboxAction } from "@/app/(admin)/admin/inbox/actions";
import { discardDraftAction } from "@/app/(admin)/admin/drafts/actions";
import { PaperclipIcon } from "./icons";
import { inboxHref } from "./url";

interface ListProps {
  folder: InboxFolder;
  q: string;
  page: number;
  demo: boolean;
}

const EMPTY: Record<InboxFolder, string> = {
  inbox: "Nothing in the Inbox.",
  needs: "Nobody is waiting on a reply.",
  drafts: "No drafts waiting.",
  sent: "Nothing sent yet.",
  archive: "Nothing archived.",
  trash: "Trash is empty.",
};

function Empty({ text }: { text: string }) {
  return <p className="px-2 py-10 text-center text-[16px] leading-relaxed text-[var(--color-text-muted)]">{text}</p>;
}

// The row's left mark: a filled dot while unread.
function UnreadDot({ on }: { on: boolean }) {
  return <span aria-hidden="true" className={`mt-[17px] h-2 w-2 shrink-0 rounded-full ${on ? "bg-[var(--color-accent)]" : ""}`} />;
}

function rowClass(selected: boolean) {
  return `group relative flex gap-2.5 rounded-[var(--radius-md)] py-4 pr-3 pl-2 transition-colors ${
    selected ? "bg-[var(--color-bg-card)]" : "hover:bg-[var(--color-bg-hover)]"
  }`;
}


// Tick-boxes: the set of ticked rows, and the bar of actions that shows once any are ticked.
function useSelection(ids: string[]) {
  const [state, setState] = useState<{ ids: string[]; picked: ReadonlySet<string> }>({ ids, picked: new Set() });
  // When the list changes (a refresh, another page or folder), ticks on rows that left it are
  // dropped there and then, so a row that comes back later is never still ticked unseen.
  if (state.ids !== ids) setState({ ids, picked: new Set(ids.filter((id) => state.picked.has(id))) });
  const picked = state.picked;
  const setPicked = (next: ReadonlySet<string>) => setState((prev) => ({ ...prev, picked: next }));
  const selected = ids.filter((id) => picked.has(id));
  const toggle = (id: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };
  const all = (on: boolean) => setPicked(on ? new Set(ids) : new Set());
  return { selected, isOn: (id: string) => picked.has(id), toggle, all, clear: () => setPicked(new Set()) };
}

interface BarAction {
  label: string;
  run: () => void;
  danger?: boolean;
}

function SelectBar({ total, count, onAll, actions, pending, error }: { total: number; count: number; onAll: (on: boolean) => void; actions: BarAction[]; pending: boolean; error: string | null }) {
  return (
    <div className="sticky top-0 z-10 -mx-1 mb-1 bg-[var(--color-bg-primary)] px-1 pb-2">
      <div className="flex min-h-10 flex-wrap items-center gap-x-1 gap-y-2 pl-2">
        <Check checked={count === total && total > 0} indeterminate={count > 0} onChange={onAll} label={count === total ? "Clear the selection" : "Select every conversation shown"} />
        {count === 0 ? (
          <span className="pl-2 text-[14px] text-[var(--color-text-dim)]">Select all</span>
        ) : (
          <>
            <span className="tabular pr-1 pl-2 text-[14px] font-medium text-[var(--color-text)]" aria-live="polite">
              {count}
              <span className="sr-only"> selected</span>
            </span>
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                disabled={pending}
                onClick={a.run}
                aria-label={a.label === "Read" || a.label === "Unread" ? `Mark ${a.label.toLowerCase()}` : undefined}
                className={`h-8 rounded-[var(--radius-sm)] px-2.5 text-[14px] transition-colors disabled:opacity-50 ${
                  a.danger
                    ? "text-[var(--color-hot)] hover:bg-[var(--color-hot)]/[0.1]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]"
                }`}
              >
                {a.label}
              </button>
            ))}
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="px-2 pt-1 text-[14px] text-[var(--color-hot)]">
          {error}
        </p>
      )}
    </div>
  );
}

/** The tick-box sits beside the row's link, never inside it, so ticking never opens the conversation. */
function RowCheck({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <span className="flex shrink-0 items-start pt-[22px] pl-2">
      <Check checked={checked} onChange={onChange} label={label} />
    </span>
  );
}

export function ThreadRows({ threads, selected, folder, q, page, demo, hasMore }: ListProps & { threads: ThreadSummary[]; selected?: string; hasMore: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const keys = useMemo(() => threads.map((t) => t.key), [threads]);
  const sel = useSelection(keys);

  if (!threads.length) return <Empty text={q ? `Nothing matches "${q}".` : EMPTY[folder]} />;

  function bulk(op: BulkMailOp) {
    const picked = sel.selected;
    if (!picked.length) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = demo ? { ok: true as const } : await bulkInboxAction(picked, op);
        if (!result.ok) setError(result.error);
        else sel.clear();
        // Filing the open conversation away closes it; reading marks leave it open.
        const closesOpen = op !== "read" && op !== "unread" && selected !== undefined && picked.includes(selected);
        if (closesOpen) router.push(inboxHref({ folder, q, page, demo }), { scroll: false });
        else router.refresh();
      } catch {
        setError("The server didn't answer. Try again in a minute.");
      }
    });
  }

  const marks: BarAction[] = [
    { label: "Read", run: () => bulk("read") },
    { label: "Unread", run: () => bulk("unread") },
  ];
  const actions: BarAction[] =
    folder === "trash"
      ? [{ label: "Put back", run: () => bulk("restore") }]
      : folder === "archive"
        ? [...marks, { label: "Move to Inbox", run: () => bulk("unarchive") }, { label: "Delete", run: () => bulk("trash"), danger: true }]
        : [...marks, { label: "Archive", run: () => bulk("archive") }, { label: "Delete", run: () => bulk("trash"), danger: true }];

  return (
    <>
      <SelectBar total={threads.length} count={sel.selected.length} onAll={sel.all} actions={actions} pending={pending} error={error} />
      <ul className="divide-y divide-[var(--color-border)]">
        {threads.map((t) => {
          const isSel = t.key === selected;
          const unread = t.unread > 0;
          const ticked = sel.isOn(t.key);
          return (
            <li key={t.key} className={`flex rounded-[var(--radius-md)] ${ticked ? "bg-[var(--color-accent)]/[0.05]" : ""}`}>
              <RowCheck checked={ticked} onChange={(on) => sel.toggle(t.key, on)} label={`Select the conversation with ${t.name}`} />
              <Link href={inboxHref({ folder, q, page, thread: t.key, demo })} scroll={false} aria-current={isSel ? "true" : undefined} className={`${rowClass(isSel)} min-w-0 flex-1`}>
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const term = q.toLowerCase();
  const shown = useMemo(
    () => (term ? drafts.filter((d) => [d.subject, d.body, d.to, d.businessName, d.contactName ?? ""].some((v) => v.toLowerCase().includes(term))) : drafts),
    [drafts, term]
  );
  const ids = useMemo(() => shown.map((d) => d.id), [shown]);
  const sel = useSelection(ids);

  if (!shown.length) return <Empty text={q ? `No drafts match "${q}".` : EMPTY.drafts} />;

  function discard() {
    const picked = sel.selected;
    if (!picked.length) return;
    setError(null);
    startTransition(async () => {
      const results = demo ? [] : await Promise.allSettled(picked.map((id) => discardDraftAction(id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed) setError(`${failed} of ${picked.length} couldn't be discarded. Try those again.`);
      else sel.clear();
      if (selected !== undefined && picked.includes(selected)) router.push(inboxHref({ folder: "drafts", q, demo }), { scroll: false });
      else router.refresh();
    });
  }

  return (
    <>
      <SelectBar total={shown.length} count={sel.selected.length} onAll={sel.all} actions={[{ label: "Discard", run: discard, danger: true }]} pending={pending} error={error} />
      <ul className="divide-y divide-[var(--color-border)]">
        {shown.map((d) => {
          const isSel = d.id === selected;
          const who = d.contactName || d.businessName;
          const ticked = sel.isOn(d.id);
          return (
            <li key={d.id} className={`flex rounded-[var(--radius-md)] ${ticked ? "bg-[var(--color-accent)]/[0.05]" : ""}`}>
              <RowCheck checked={ticked} onChange={(on) => sel.toggle(d.id, on)} label={`Select the draft to ${who}`} />
              <Link href={inboxHref({ folder: "drafts", q, draft: d.id, demo })} scroll={false} aria-current={isSel ? "true" : undefined} className={`${rowClass(isSel)} min-w-0 flex-1`}>
                {isSel && <span aria-hidden="true" className="absolute top-3 bottom-3 -left-[1px] w-[3px] rounded-r bg-[var(--color-steel)]" />}
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
    </>
  );
}
