"use client";

import LocalDate from "@/components/admin/LocalDate";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EmailAccount, EmailMessage } from "@/lib/store/messages";
import { markThreadReadAction, sendLeadEmailAction } from "./messageActions";

// Replies land in the background (webhook / Gmail sync); re-read the thread this often while open.
const POLL_MS = 30_000;

interface MessagesPanelProps {
  leadId: string;
  leadEmail: string;
  contactName: string | null;
  suggestedOpener: string | null;
  messages: EmailMessage[];
  accounts: EmailAccount[];
}

function when(iso: string) {
  return <LocalDate iso={iso} options={{ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }} />;
}

function Bubble({ message }: { message: EmailMessage }) {
  const out = message.direction === "out";
  return (
    <li className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] sm:max-w-[75%] ${out ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`rounded-[2px] border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
            out
              ? message.status === "failed"
                ? "border-[var(--color-livery-red)]/50 bg-[var(--color-livery-red)]/10 text-[var(--color-text)]"
                : "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/[0.08] text-[var(--color-text)]"
              : "border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)]"
          }`}
        >
          {message.subject && <p className="mb-1.5 text-xs font-medium text-[var(--color-text-muted)]">{message.subject}</p>}
          {message.bodyText}
        </div>
        <p className="mt-1 px-1 text-[11px] text-[var(--color-text-dim)]">
          {out ? `${message.sentBy ?? message.fromAddress} via ${message.fromAddress}` : message.fromAddress} · {when(message.createdAt)}
          {message.status === "failed" && <span className="text-[var(--color-livery-red)]"> · not sent: {message.error}</span>}
        </p>
      </div>
    </li>
  );
}

export default function MessagesPanel({ leadId, leadEmail, contactName, suggestedOpener, messages, accounts }: MessagesPanelProps) {
  const router = useRouter();
  const active = accounts.filter((a) => a.status === "active");
  const lastSubject = [...messages].reverse().find((m) => m.subject)?.subject ?? "";
  const lastInbound = [...messages].reverse().find((m) => m.direction === "in");

  const [accountId, setAccountId] = useState(active[0]?.id ?? "");
  // The lead's own address first; a reply's sender only when the lead has none (bounces come from system addresses).
  const [to, setTo] = useState(leadEmail || lastInbound?.fromAddress || "");
  const [subject, setSubject] = useState(lastSubject ? (/^re:/i.test(lastSubject) ? lastSubject : `Re: ${lastSubject}`) : "");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const unread = messages.some((m) => m.direction === "in" && !m.readAt);

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

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await sendLeadEmailAction({ leadId, accountId, to, subject, body });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody("");
      if (!/^re:/i.test(subject)) setSubject(`Re: ${subject}`);
      router.refresh();
    });
  }

  const inputClass =
    "w-full rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-dim)] outline-none focus:border-[var(--color-accent)]/50";

  return (
    <section id="messages" aria-labelledby="messages-heading" className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4 sm:px-6">
        <h2 id="messages-heading" className="label-mono text-[var(--color-steel)]">
          Messages
        </h2>
        <span className="text-xs text-[var(--color-text-dim)]">{messages.length ? `${messages.length} in thread` : "No emails yet"}</span>
      </div>

      <div className="max-h-[32rem] overflow-y-auto px-4 py-5 sm:px-6">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">
            Start the conversation below. Replies show up here automatically.
          </p>
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
          <p className="text-sm text-[var(--color-text-muted)]">
            No sending address yet.{" "}
            <Link href="/admin/settings#email-accounts" className="text-[var(--color-accent)] hover:underline">
              Connect Outlook in Settings
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label-mono mb-1 block text-[var(--color-text-dim)]">From</span>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass} disabled={pending}>
                  {active.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName ? `${a.displayName} <${a.address}>` : a.address}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label-mono mb-1 block text-[var(--color-text-dim)]">To</span>
                <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@business.com" className={inputClass} disabled={pending} />
              </label>
            </div>
            <label className="block">
              <span className="label-mono mb-1 block text-[var(--color-text-dim)]">Subject</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} disabled={pending} maxLength={200} />
            </label>
            <label className="block">
              <span className="sr-only">Message</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
                }}
                rows={6}
                placeholder="Write your message…"
                className={`${inputClass} resize-y leading-relaxed`}
                disabled={pending}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {suggestedOpener && messages.length === 0 ? (
                <button type="button" onClick={applyOpener} disabled={pending} className="text-sm text-[var(--color-accent)] hover:underline">
                  Use suggested opener
                </button>
              ) : (
                <span className="text-xs text-[var(--color-text-dim)]">⌘ Enter to send</span>
              )}
              <button
                type="button"
                onClick={send}
                disabled={pending || !body.trim()}
                className="inline-flex min-h-10 items-center justify-center rounded-[2px] bg-[var(--color-accent)] px-6 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
