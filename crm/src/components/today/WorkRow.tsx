"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { TodayItem } from "@/lib/store/today";
import type { SenderAccount } from "@/components/inbox/sender";
import SendControls from "./SendControls";
import { Avatar, money, primaryLabel, TONE_BAR, TONE_TEXT } from "./shared";
import styles from "./today.module.css";

interface WorkRowProps {
  item: TodayItem;
  /** First in Max's order: marked "Start here". */
  first: boolean;
  open: boolean;
  onToggle: () => void;
  // The rest only matter while the row is open.
  body: string;
  editing: boolean;
  leaving: boolean;
  error: string | null;
  onEditToggle: () => void;
  onBodyChange: (body: string) => void;
  onSend: () => void;
  senders: SenderAccount[];
  senderId: string;
  onSender: (id: string) => void;
  includeSignature: boolean;
  onIncludeSignature: (on: boolean) => void;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
    >
      <path d="M4.5 7l4.5 4.5L13.5 7" />
    </svg>
  );
}

const DRAFT_LABEL = { reply: "Your reply, drafted", followup: "Your follow-up, drafted", new: "Your email, drafted" } as const;

// One person on Today's list. Closed: one line of who, why and how long. Open: what they said (or
// why we're chasing), the drafted email, who it goes out as, and the one button that does it.
export default function WorkRow({
  item,
  first,
  open,
  onToggle,
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
}: WorkRowProps) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const panelId = `work-${item.key}`;

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
    <li className={`border-b border-[var(--color-border)] ${open ? "bg-[var(--color-bg-card)]" : ""} ${leaving && open ? styles.heroOut : styles.rowIn}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="group grid w-full grid-cols-[4px_36px_minmax(0,1fr)_20px] items-start gap-x-4 px-3 py-4 text-left transition-colors hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-steel)] sm:px-4 md:grid-cols-[4px_36px_minmax(0,1fr)_88px_20px]"
      >
        <i aria-hidden="true" className={`self-stretch rounded-[2px] ${TONE_BAR[item.tone]}`} />
        <span className="mt-px">
          <Avatar name={item.name} initials={item.initials} />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="text-[16px] font-semibold text-[var(--color-text)] group-hover:text-white">
              {item.name}
              {item.company && <span className="font-normal text-[var(--color-text-dim)]"> · {item.company}</span>}
            </span>
            {first && <span className="text-[14px] font-semibold text-[var(--color-accent)]">Start here</span>}
          </span>
          {!open && <span className="mt-[3px] block truncate text-[15px] text-[var(--color-text-muted)]">{item.summary}</span>}
          <span className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[14px] text-[var(--color-text-dim)]">
            {item.meta.map((m, i) => (
              <span key={m} className={i === 0 ? TONE_TEXT[item.tone] : undefined}>
                {m}
              </span>
            ))}
          </span>
        </span>
        <span className="tabular hidden pt-0.5 text-right text-[15px] text-[var(--color-text-muted)] md:block">{item.value != null ? money(item.value) : ""}</span>
        <span className="pt-0.5 text-[var(--color-text-dim)] group-hover:text-[var(--color-text)]">
          <Chevron open={open} />
        </span>
      </button>

      {open && (
        <div id={panelId} className={`pr-4 pb-5 pl-6 sm:pr-6 sm:pl-[72px] ${styles.heroIn}`}>
          {context && (
            <blockquote className="border-l-2 border-[var(--color-border-bright)] py-0.5 pl-4 text-[16px] leading-[1.55] text-[var(--color-text)]">
              {item.quote ? `“${context.text}”` : context.text}
              <small className="mt-1 block text-[14px] text-[var(--color-text-muted)]">{context.said}</small>
            </blockquote>
          )}

          {item.draft && (
            <div className="well mt-4 px-4 py-3">
              <div className="mb-1 text-[14px] text-[var(--color-text-dim)]">{DRAFT_LABEL[item.kind]}</div>
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

          {item.draft && item.action === "send" && (
            <div className="mt-3">
              <SendControls
                senders={senders}
                senderId={senderId}
                onSender={onSender}
                includeSignature={includeSignature}
                onIncludeSignature={onIncludeSignature}
                disabled={leaving}
              />
            </div>
          )}

          {error && (
            <p role="alert" className="mt-3 text-[15px] text-[var(--color-hot)]">
              That didn&apos;t send: {error}
            </p>
          )}

          <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            {primary}
            {item.action === "send" && (
              <button type="button" className="btn btn-secondary w-full sm:w-auto" onClick={onEditToggle} aria-pressed={editing}>
                {editing ? "Done" : "Edit"}
              </button>
            )}
            <Link href={recordHref} className="btn-quiet self-center px-2 py-2 sm:py-0">
              Open {item.firstName}&apos;s record
            </Link>
            {item.action === "send" && <span className="ml-auto hidden font-mono text-[14px] text-[var(--color-text-muted)] sm:inline">⌘↵ to send</span>}
          </div>
        </div>
      )}
    </li>
  );
}
