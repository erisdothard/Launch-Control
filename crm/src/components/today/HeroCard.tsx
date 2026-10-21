"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { TodayItem } from "@/lib/store/today";
import { SendAsSwitch, SignatureToggle } from "@/components/inbox/SendAs";
import type { SenderAccount } from "@/components/inbox/sender";
import { Avatar, LiveryRail, money, primaryLabel, TONE_TEXT } from "./shared";
import styles from "./today.module.css";

interface HeroCardProps {
  item: TodayItem;
  total: number;
  body: string;
  editing: boolean;
  leaving: boolean;
  error: string | null;
  onEditToggle: () => void;
  onBodyChange: (body: string) => void;
  onSend: () => void;
  /** Who the drafted email goes out as, and whether it's signed. */
  senders: SenderAccount[];
  senderId: string;
  onSender: (id: string) => void;
  includeSignature: boolean;
  onIncludeSignature: (on: boolean) => void;
}

function Sparkle() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M6 0l1.4 4.6L12 6l-4.6 1.4L6 12 4.6 7.4 0 6l4.6-1.4z" />
    </svg>
  );
}

const DRAFT_LABEL = { reply: "Your reply, drafted", followup: "Your follow-up, drafted", new: "Your email, drafted" } as const;

// "Do this first": the one thing at the top of Max's queue, with the reply ready to go.
export default function HeroCard({
  item,
  total,
  body,
  editing,
  leaving,
  error,
  onEditToggle,
  onBodyChange,
  onSend,
  senders,
  senderId,
  onSender,
  includeSignature,
  onIncludeSignature,
}: HeroCardProps) {
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = textRef.current;
    if (!editing || !t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight}px`;
  }, [editing, body]);

  useEffect(() => {
    const t = textRef.current;
    if (!editing || !t) return;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }, [editing]);

  const context = item.quote ?? item.note;
  const recordHref = `/admin/leads/${item.leadId}`;
  const whoLine = [item.role, item.company].filter(Boolean).join(" · ");

  let primary: React.ReactNode;
  if (item.action === "send") {
    primary = (
      <button type="button" className="btn btn-primary w-full sm:w-auto" onClick={onSend} disabled={leaving}>
        {primaryLabel(item)}
      </button>
    );
  } else if (item.action === "call") {
    primary = (
      <a className="btn btn-primary w-full sm:w-auto" href={`tel:${item.phone.replace(/[^\d+]/g, "")}`}>
        {primaryLabel(item)}
      </a>
    );
  } else {
    primary = (
      <Link className="btn btn-primary w-full sm:w-auto" href={`${recordHref}#messages`}>
        {primaryLabel(item)}
      </Link>
    );
  }

  return (
    <article
      aria-live="polite"
      aria-label={`Do this first: ${item.name}`}
      className={`card relative overflow-hidden ${leaving ? styles.heroOut : styles.heroIn}`}
    >
      <LiveryRail />
      <div className="py-5 pr-5 pl-7 sm:py-[22px] sm:pr-7 sm:pl-[34px]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14.5px] text-[var(--color-text-muted)]">
          <span className="font-mono text-[14px]">
            1 of {total}
          </span>
          <span className="font-semibold text-[var(--color-accent)]">Do this first</span>
          <span className={`ml-auto ${TONE_TEXT[item.tone === "new" ? "warm" : item.tone]}`}>{item.waitLabel}</span>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-4">
          <Avatar name={item.name} initials={item.initials} size={52} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[18px] leading-[1.3] tracking-[0.03em] text-[var(--color-text)] uppercase sm:text-[20px]">
              {item.name}
            </h2>
            {whoLine && <p className="mt-0.5 text-[15px] text-[var(--color-text-muted)]">{whoLine}</p>}
          </div>
          <div className="w-full text-left sm:w-auto sm:text-right">
            {item.value != null ? (
              <>
                <b className="tabular block text-[26px] leading-[1.1] font-light tracking-[-0.02em] text-[var(--color-steel)] sm:text-[30px]">
                  {money(item.value)}
                </b>
                <span className="text-[14px] text-[var(--color-text-dim)]">Deal value</span>
              </>
            ) : (
              <span className="text-[14px] text-[var(--color-text-dim)]">Not quoted yet</span>
            )}
          </div>
        </div>

        {context && (
          <blockquote className="mt-[18px] border-l-2 border-[var(--color-border-bright)] py-0.5 pl-[18px] text-[16.5px] leading-[1.55] text-[var(--color-text)]">
            {item.quote ? `“${context.text}”` : context.text}
            <small className="mt-1 block text-[14px] text-[var(--color-text-muted)]">{context.said}</small>
          </blockquote>
        )}

        {item.draft && item.action === "send" && senders.length > 0 && (
          <div className="mt-[18px]">
            <SendAsSwitch options={senders} value={senderId} onChange={onSender} disabled={leaving} />
          </div>
        )}

        {item.draft && (
          <div className="well mt-[14px] px-[18px] py-3.5">
            <div className="mb-1.5 flex items-center gap-2 text-[14px] text-[var(--color-text-dim)]">
              <Sparkle />
              {DRAFT_LABEL[item.kind]}
            </div>
            {editing ? (
              <textarea
                ref={textRef}
                value={body}
                onChange={(e) => onBodyChange(e.target.value)}
                aria-label="Edit the drafted email"
                rows={3}
                className="block w-full resize-none rounded-[2px] bg-transparent text-[16px] leading-[1.6] text-[var(--color-text)] outline outline-1 outline-offset-8 outline-[var(--color-border-bright)] focus:outline-[var(--color-steel)]"
              />
            ) : (
              <p className="text-[16px] leading-[1.6] whitespace-pre-line text-[var(--color-text)]">{body}</p>
            )}
          </div>
        )}

        {item.draft && item.action === "send" && senders.length > 0 && (
          <div className="mt-3">
            <SignatureToggle account={senders.find((a) => a.id === senderId)} on={includeSignature} onChange={onIncludeSignature} disabled={leaving} />
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-[15px] text-[var(--color-hot)]">
            That didn&apos;t send: {error}
          </p>
        )}

        <div className="mt-[18px] flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          {primary}
          {item.action === "send" && (
            <button type="button" className="btn btn-secondary w-full sm:w-auto" onClick={onEditToggle} aria-pressed={editing}>
              {editing ? "Done" : "Edit"}
            </button>
          )}
          <Link href={recordHref} className="btn-quiet self-center px-2 py-2 sm:py-0">
            Open {item.firstName}&apos;s record
          </Link>
          {item.action === "send" && (
            <span className="ml-auto hidden font-mono text-[14px] text-[var(--color-text-muted)] sm:inline">⌘↵ to send</span>
          )}
        </div>
      </div>
    </article>
  );
}
