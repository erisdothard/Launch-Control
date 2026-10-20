"use client";

import LocalDate from "@/components/admin/LocalDate";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EmailAccount, EmailMessage } from "@/lib/store/messages";
import type { EmailDraft } from "@/lib/store/drafts";
import { discardDraftAction, sendDraftAction } from "../../drafts/actions";
import { markThreadReadAction, sendLeadEmailAction } from "./messageActions";

// Replies land in the background (webhook / Gmail sync); re-read the thread this often while open.
const POLL_MS = 30_000;

interface MessagesPanelProps {
  leadId: string;
  leadEmail: string;
  businessName: string;
  /** From Settings > Company; the first email's subject is "<Company> × <business>". */
  companyName: string;
  contactName: string | null;
  suggestedOpener: string | null;
  messages: EmailMessage[];
  accounts: EmailAccount[];
  /** An AI draft waiting for this lead, if any. It pre-fills the box. */
  draft: EmailDraft | null;
}

function when(iso: string) {
  return <LocalDate iso={iso} options={{ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }} />;
}

function bubbleClass(message: EmailMessage): string {
  if (message.direction !== "out") return "border-[var(--color-border)] bg-[var(--color-bg-secondary)]";
  if (message.status === "failed") return "border-[var(--color-danger)] bg-[var(--color-danger-bg)]";
  return "border-[var(--color-accent-border)] bg-[var(--color-accent-soft)]";
}

function Bubble({ message }: { message: EmailMessage }) {
  const out = message.direction === "out";
  return (
    <li className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[85%] flex-col sm:max-w-[75%] ${out ? "items-end" : "items-start"}`}>
        <div className={`rounded-[2px] border px-4 py-3 text-base leading-relaxed whitespace-pre-wrap break-words text-[var(--color-text)] ${bubbleClass(message)}`}>
          {message.subject && <p className="t-small mb-1.5 font-medium text-[var(--color-text-muted)]">{message.subject}</p>}
          {message.bodyText}
        </div>
        <p className="t-small mt-1 px-1 text-[var(--color-text-dim)]">
          {out ? `${message.sentBy ?? message.fromAddress} via ${message.fromAddress}` : message.fromAddress} · {when(message.createdAt)}
          {message.status === "failed" && <span className="text-[var(--color-danger)]"> · not sent: {message.error}</span>}
        </p>
      </div>
    </li>
  );
}

function firstSubject(lastSubject: string, companyName: string, businessName: string): string {
  if (lastSubject) return /^re:/i.test(lastSubject) ? lastSubject : `Re: ${lastSubject}`;
  return `${companyName} × ${businessName}`;
}

export default function MessagesPanel({
  leadId,
  leadEmail,
  businessName,
  companyName,
  contactName,
  suggestedOpener,
  messages,
  accounts,
  draft,
}: MessagesPanelProps) {
  const router = useRouter();
  const active = accounts.filter((a) => a.status === "active");
  const lastSubject = [...messages].reverse().find((m) => m.subject)?.subject ?? "";
  const lastInbound = [...messages].reverse().find((m) => m.direction === "in");
  const defaultSubject = firstSubject(lastSubject, companyName, businessName);
  // The lead's own address first; a reply's sender only when the lead has none (bounces come from system addresses).
  const defaultTo = leadEmail || lastInbound?.fromAddress || "";

  const [accountId, setAccountId] = useState(active[0]?.id ?? "");
  const [to, setTo] = useState(draft?.to ?? defaultTo);
  const [subject, setSubject] = useState(draft?.subject ?? defaultSubject);
  const [body, setBody] = useState(draft?.body ?? "");
  const [usingDraft, setUsingDraft] = useState(draft !== null);
  const [showAddress, setShowAddress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const unread = messages.some((m) => m.direction === "in" && !m.readAt);
  const fromAccount = active.find((a) => a.id === accountId) ?? active[0];

  useEffect(() => {
    if (unread) void markThreadReadAction(leadId);
  }, [unread, leadId]);

  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  function applyOpener() {
    const greeting = contactName ? `Hi ${contactName.split(" ")[0]},\n\n` : "Hi,\n\n";
    setBody(`${greeting}${suggestedOpener ?? ""}\n\n`);
  }

  function discardDraft() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      try {
        await discardDraftAction(draft.id);
      } catch {
        setError("Couldn't discard the draft. Try again.");
        return;
      }
      setUsingDraft(false);
      setTo(defaultTo);
      setSubject(defaultSubject);
      setBody("");
      router.refresh();
    });
  }

  function send() {
    setError(null);
    startTransition(async () => {
      // A draft goes through sendDraftAction so it is marked sent; its To and From are fixed to the thread.
      const result =
        usingDraft && draft
          ? await sendDraftAction(draft.id, { subject, body })
          : await sendLeadEmailAction({ leadId, accountId, to, subject, body });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody("");
      setUsingDraft(false);
      setShowAddress(false);
      if (!/^re:/i.test(subject)) setSubject(`Re: ${subject}`);
      router.refresh();
    });
  }

  const draftLocked = usingDraft && draft !== null;

  return (
    <section id="messages" aria-labelledby="messages-heading" className="card">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4 sm:px-6">
        <h2 id="messages-heading" className="label-mono text-[var(--color-steel)]">
          Messages
        </h2>
        <span className="t-small text-[var(--color-text-dim)]">{messages.length ? `${messages.length} in thread` : "No emails yet"}</span>
      </div>

      <div className="max-h-[32rem] overflow-y-auto px-4 py-5 sm:px-6">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-[var(--color-text-dim)]">Start the conversation below. Replies show up here automatically.</p>
        ) : (
          <ul className="space-y-4">
            {messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-[var(--color-border)] px-4 py-4 sm:px-6">
        {active.length === 0 ? (
          <p className="text-[var(--color-text-muted)]">
            {accounts.length > 0 ? "Your email needs reconnecting before you can send." : "No sending address yet."}{" "}
            <Link href="/admin/settings#email-accounts" className="link">
              {accounts.length > 0 ? "Reconnect Outlook in Settings" : "Connect Outlook in Settings"}
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-3">
            {draftLocked && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[var(--color-text)]">Drafted for you. Edit if you like, then send.</p>
                <button type="button" onClick={discardDraft} disabled={pending} className="btn-quiet">
                  Discard draft
                </button>
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={() => setShowAddress((v) => !v)}
                aria-expanded={showAddress}
                aria-controls="compose-address"
                className="link t-small min-h-[var(--control-height)] px-0"
              >
                {showAddress ? "Hide address and subject" : "Edit address and subject"}
              </button>
              {!showAddress && (
                <p className="t-small text-[var(--color-text-dim)]">
                  To {to || "nobody yet"} · {subject}
                </p>
              )}
            </div>

            {showAddress && (
              <div id="compose-address" className="space-y-3 rounded-[2px] bg-[var(--color-bg-secondary)] p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="t-small mb-1 block text-[var(--color-text-muted)]">From</span>
                    {active.length > 1 && !draftLocked ? (
                      <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input" disabled={pending}>
                        {active.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.displayName ? `${a.displayName} <${a.address}>` : a.address}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="flex min-h-[var(--control-height)] items-center text-[var(--color-text)]">
                        {draftLocked ? "The address this conversation is on" : fromAccount?.address}
                      </p>
                    )}
                  </label>
                  <label className="block">
                    <span className="t-small mb-1 block text-[var(--color-text-muted)]">To</span>
                    <input
                      type="email"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="name@business.com"
                      className="input"
                      disabled={pending || draftLocked}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="t-small mb-1 block text-[var(--color-text-muted)]">Subject</span>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" disabled={pending} maxLength={200} />
                </label>
              </div>
            )}

            <label className="block">
              <span className="sr-only">Message</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) send();
                }}
                rows={5}
                placeholder="Write your message…"
                className="input resize-y"
                disabled={pending}
              />
            </label>
            {error && (
              <p role="alert" className="text-[var(--color-danger)]">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {suggestedOpener && messages.length === 0 && !draftLocked ? (
                <button type="button" onClick={applyOpener} disabled={pending} className="btn-quiet px-0">
                  Start from the suggested opener
                </button>
              ) : (
                <span className="t-small text-[var(--color-text-dim)]">⌘ Enter to send</span>
              )}
              <button type="button" onClick={send} disabled={pending || !body.trim() || !to.trim()} className="btn btn-primary">
                {pending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
