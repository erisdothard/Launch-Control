"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Composer from "@/components/inbox/Composer";
import MessageItem from "@/components/inbox/MessageItem";
import { inboxHref } from "@/components/inbox/url";
import { replySubject } from "@/lib/email/text";
import type { EmailAccount, EmailMessage } from "@/lib/store/messages";
import { markThreadReadAction } from "./messageActions";

// Replies land in the background (Outlook / Gmail sync); re-read the thread this often while open.
const POLL_MS = 30_000;

interface MessagesPanelProps {
  leadId: string;
  leadEmail: string;
  contactName: string | null;
  suggestedOpener: string | null;
  messages: EmailMessage[];
  accounts: EmailAccount[];
}

// Answer as whoever wrote last on this thread (Max or Eris); a first email starts as Max.
function defaultAccount(accounts: EmailAccount[], messages: EmailMessage[]): string {
  return [...messages].reverse().find((m) => m.direction === "out" && accounts.some((a) => a.id === m.accountId))?.accountId ?? "";
}

export default function MessagesPanel({ leadId, leadEmail, contactName, suggestedOpener, messages, accounts }: MessagesPanelProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const unread = messages.some((m) => m.direction === "in" && !m.readAt);
  const lastInbound = [...messages].reverse().find((m) => m.direction === "in");
  const lastSubject = [...messages].reverse().find((m) => m.subject)?.subject ?? "";
  const conversation = [...messages].reverse().find((m) => m.conversationId)?.conversationId;

  useEffect(() => {
    if (unread) void markThreadReadAction(leadId);
  }, [unread, leadId]);

  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [router]);

  // The lead's own address first; a reply's sender only when the lead has none (bounces come from system addresses).
  const initial = useMemo(
    () => ({ to: leadEmail || lastInbound?.fromAddress || "", cc: "", bcc: "", subject: lastSubject ? replySubject(lastSubject) : "", body: "" }),
    [leadEmail, lastInbound?.fromAddress, lastSubject]
  );
  const greeting = contactName ? `Hi ${contactName.split(" ")[0]},\n\n` : "Hi,\n\n";
  const collapseBefore = messages.length > 3 ? messages.length - 2 : 0;

  return (
    <section id="messages" aria-labelledby="messages-heading" className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-5 sm:px-7 sm:pt-6">
        <h2 id="messages-heading" className="text-[17px] font-semibold text-[var(--color-text)]">
          Email
        </h2>
        <p className="text-[15px] text-[var(--color-text-muted)]">
          {messages.length ? `${messages.length} in this conversation` : "No emails yet"}
          {conversation && (
            <>
              {" · "}
              <Link href={inboxHref({ folder: "inbox", thread: conversation })} className="btn-quiet text-[15px]">
                Open in Inbox
              </Link>
            </>
          )}
        </p>
      </div>

      {/* No inner scroll box: the page scrolls. Older messages fold into one line each instead. */}
      <div className="px-5 sm:px-7">
        {messages.length === 0 ? (
          <p className="py-8 text-[16px] text-[var(--color-text-muted)]">Start the conversation below. Replies show up here automatically.</p>
        ) : (
          <ol className="divide-y divide-[var(--color-border)]">
            {messages.map((m, i) => (
              <MessageItem
                key={m.id}
                m={m}
                demo={false}
                collapsed={i < collapseBefore && !expanded.has(m.id)}
                onExpand={() => setExpanded((s) => new Set(s).add(m.id))}
              />
            ))}
          </ol>
        )}
      </div>

      <div className="border-t border-[var(--color-border)] px-2 pt-4 pb-3 sm:px-4">
        <Composer
          key={`${leadId}:${messages.length}`}
          mode={messages.length ? "reply" : "new"}
          accounts={accounts}
          defaultAccountId={defaultAccount(accounts, messages)}
          initial={initial}
          replyToMessageId={lastInbound?.id ?? null}
          leadId={leadId}
          storageKey={`lc-lead:${leadId}`}
          compactHeader={messages.length > 0 && Boolean(initial.to)}
          primary={false}
          suggestion={suggestedOpener && messages.length === 0 ? { label: "Use suggested opener", body: `${greeting}${suggestedOpener}\n\n` } : undefined}
        />
      </div>
    </section>
  );
}
