"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { replySubject } from "@/lib/email/text";
import type { EmailAccount, EmailMessage, ThreadLead } from "@/lib/store/messages";
import { addAsLeadAction, setArchivedAction, setReadAction } from "@/app/(admin)/admin/inbox/actions";
import Composer, { type ComposerFields, type ComposerMode } from "./Composer";
import { BackIcon } from "./icons";
import MessageItem, { senderName, splitAddresses as split } from "./MessageItem";

interface ReadingPaneProps {
  threadKey: string;
  messages: EmailMessage[];
  lead: ThreadLead | null;
  accounts: EmailAccount[];
  defaultAccountId: string;
  backHref: string;
  archived: boolean;
  demo: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  meeting: "Meeting booked",
  proposal: "Proposal out",
  converted: "Customer",
  lost: "Closed",
};

export default function ReadingPane({ threadKey, messages, lead, accounts, defaultAccountId, backHref, archived, demo }: ReadingPaneProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Exclude<ComposerMode, "new" | "draft">>("reply");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const own = useMemo(() => new Set(accounts.map((a) => a.address.toLowerCase())), [accounts]);
  const unread = messages.some((m) => m.direction === "in" && !m.readAt);
  const last = messages[messages.length - 1];
  const target = [...messages].reverse().find((m) => m.direction === "in") ?? last;
  const subject = last?.subject || "(no subject)";

  // Opening a conversation reads it (never in the sample).
  useEffect(() => {
    if (demo || !unread) return;
    void setReadAction(threadKey, true).then((r) => r.ok && router.refresh());
  }, [demo, unread, threadKey, router]);

  // Answer as whoever wrote last on this conversation (Max or Eris); new conversations start as Max.
  const threadAccount = [...messages].reverse().find((m) => m.direction === "out" && accounts.some((a) => a.id === m.accountId))?.accountId;
  const fromId = threadAccount ?? defaultAccountId;

  const initial = useMemo((): ComposerFields => {
    if (!target) return { to: "", cc: "", bcc: "", subject: "", body: "" };
    const them = target.direction === "in" ? target.fromAddress : (split(target.toAddress)[0] ?? "");
    if (mode === "forward") {
      const stamp = new Date(target.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
      const fwd = /^fwd?:/i.test(target.subject.trim()) ? target.subject.trim() : `Fwd: ${target.subject.trim()}`;
      return {
        to: "",
        cc: "",
        bcc: "",
        subject: fwd,
        body: `\n\n---------- Forwarded message ----------\nFrom: ${senderName(target)} <${target.fromAddress}>\nDate: ${stamp}\nSubject: ${target.subject}\nTo: ${target.toAddress}\n\n${target.bodyText}`,
      };
    }
    const cc =
      mode === "replyAll"
        ? [...new Set([...split(target.toAddress), ...split(target.ccAddress)])].filter((a) => !own.has(a) && a !== them).join(", ")
        : "";
    return { to: them, cc, bcc: "", subject: replySubject(target.subject), body: "" };
  }, [mode, target, own]);

  if (!last) {
    return <p className="p-8 text-[16px] text-[var(--color-text-muted)]">That conversation is empty or was removed.</p>;
  }

  const canReplyAll = target && [...split(target.toAddress), ...split(target.ccAddress)].filter((a) => !own.has(a)).length > (target.direction === "in" ? 0 : 1);

  function run(task: () => Promise<{ ok: boolean; error?: string }>, after: () => void) {
    if (demo) return setError("This is sample data. Nothing changes.");
    setError(null);
    startTransition(async () => {
      const r = await task();
      if (!r.ok) return setError(r.error ?? "That didn't work. Try again.");
      after();
    });
  }

  const name = target ? senderName(target) : "";
  const collapseBefore = messages.length > 3 ? messages.length - 2 : 0;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 bg-[var(--color-bg-card)] px-5 pt-5 pb-4 sm:px-8 sm:pt-6">
        <div className="flex items-center gap-2">
          <Link href={backHref} scroll={false} className="btn btn-secondary btn-sm -ml-1 lg:hidden" aria-label="Back to the list">
            <BackIcon />
            Back
          </Link>
          <div className="ml-auto flex gap-2">
            {!unread && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => setReadAction(threadKey, false), () => router.push(backHref, { scroll: false }))}>
                Mark unread
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={pending}
              onClick={() => run(() => setArchivedAction(threadKey, !archived), () => router.push(backHref, { scroll: false }))}
            >
              {archived ? "Move to Inbox" : "Archive"}
            </button>
          </div>
        </div>
        <h2 className="mt-4 text-[22px] leading-[1.3] font-semibold tracking-[-0.01em] text-[var(--color-text)] sm:text-[24px]">{subject}</h2>
        {error && (
          <p role="alert" className="mt-2 text-[15px] text-[var(--color-hot)]">
            {error}
          </p>
        )}
      </header>

      <div className="px-5 sm:px-8">
        {lead ? (
          <div className="well flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
            <p className="min-w-[12rem] flex-1 text-[15px] text-[var(--color-text)]">
              <span className="font-semibold">{lead.businessName}</span>
              {lead.contactName && <span className="text-[var(--color-text-muted)]"> · {lead.contactName}</span>}
              <span className="text-[var(--color-text-muted)]"> · {STATUS_LABEL[lead.status] ?? lead.status}</span>
            </p>
            <Link href={`/admin/leads/${lead.id}`} className="btn-quiet text-[15px] text-[var(--color-text)]">
              Open lead record
            </Link>
          </div>
        ) : (
          <div className="well flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
            <p className="min-w-[12rem] flex-1 text-[15px] text-[var(--color-text-muted)]">
              {name} isn&apos;t a lead yet. Add them to track the conversation and follow up.
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={pending}
              onClick={() => run(() => addAsLeadAction(threadKey), () => router.refresh())}
            >
              Add as lead
            </button>
          </div>
        )}

        <ol className="mt-2 divide-y divide-[var(--color-border)]">
          {messages.map((m, i) => (
            <MessageItem
              key={m.id}
              m={m}
              demo={demo}
              collapsed={i < collapseBefore && !expanded.has(m.id)}
              onExpand={() => setExpanded((s) => new Set(s).add(m.id))}
            />
          ))}
        </ol>
      </div>

      <section aria-label="Reply" className="mt-auto border-t border-[var(--color-border)] bg-[var(--color-bg-primary)]/40 px-3 pt-4 pb-5 sm:px-6">
        <div role="tablist" aria-label="How to answer" className="mb-3 flex gap-1 px-2">
          {(
            [
              ["reply", "Reply"],
              ["replyAll", "Reply all"],
              ["forward", "Forward"],
            ] as const
          )
            .filter(([m]) => m !== "replyAll" || canReplyAll)
            .map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-full px-4 py-2 text-[15px] transition-colors ${
                  mode === m ? "bg-[var(--color-bg-secondary)] text-[var(--color-text)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {label}
              </button>
            ))}
        </div>
        <Composer
          key={`${threadKey}:${mode}`}
          mode={mode}
          accounts={accounts}
          defaultAccountId={fromId}
          initial={initial}
          replyToMessageId={target?.id ?? null}
          leadId={lead?.id ?? null}
          storageKey={demo ? undefined : `lc-inbox:${threadKey}:${mode}`}
          demo={demo}
          searchLeads={mode === "forward"}
          compactHeader={mode !== "forward"}
        />
      </section>
    </div>
  );
}
