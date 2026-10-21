"use client";

import LocalDate from "@/components/admin/LocalDate";
import type { EmailMessage } from "@/lib/store/messages";
import Avatar from "./Avatar";
import { DownloadIcon } from "./icons";
import { fileSize } from "./url";

// One email in a conversation: the Inbox reading pane and the lead record's Messages both use it.

export function senderName(m: EmailMessage): string {
  return m.fromName || m.fromAddress;
}

export function splitAddresses(list: string): string[] {
  return list
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function when(iso: string) {
  return <LocalDate iso={iso} options={{ weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }} />;
}

export default function MessageItem({ m, demo, collapsed, onExpand }: { m: EmailMessage; demo: boolean; collapsed: boolean; onExpand: () => void }) {
  const name = senderName(m);
  if (collapsed) {
    return (
      <li>
        <button type="button" onClick={onExpand} className="flex w-full items-center gap-4 rounded-[var(--radius-md)] px-2 py-3 text-left hover:bg-[var(--color-bg-hover)]">
          <Avatar name={name} seed={m.fromAddress} size={32} />
          <span className="w-40 shrink-0 truncate text-[15px] font-medium text-[var(--color-text)]">{name}</span>
          <span className="min-w-0 flex-1 truncate text-[15px] text-[var(--color-text-dim)]">{m.bodyText.replace(/\s+/g, " ")}</span>
          <span className="hidden shrink-0 text-[14px] text-[var(--color-text-dim)] sm:inline">{when(m.createdAt)}</span>
        </button>
      </li>
    );
  }
  const recipients = [m.toAddress && `to ${m.toAddress}`, m.ccAddress && `cc ${m.ccAddress}`].filter(Boolean).join(" · ");
  return (
    <li className="py-5">
      <article>
        <header className="flex items-start gap-4">
          <Avatar name={name} seed={m.fromAddress} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <p className="text-[16px] font-semibold text-[var(--color-text)]">{name}</p>
              <span className="text-[14px] text-[var(--color-text-dim)]">{when(m.createdAt)}</span>
            </div>
            <p className="mt-0.5 text-[14px] break-words text-[var(--color-text-dim)]">
              {m.fromName && <span className="text-[var(--color-text-muted)]">{m.fromAddress} </span>}
              {recipients}
            </p>
          </div>
        </header>
        <div className="mt-4 text-[16px] leading-[1.65] break-words whitespace-pre-wrap text-[var(--color-text)] sm:pl-14">{m.bodyText || "(no text)"}</div>
        {m.status === "failed" && (
          <p className="mt-3 text-[15px] text-[var(--color-hot)] sm:pl-14">Not sent: {m.error ?? "the provider refused it"}.</p>
        )}
        {m.attachments.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2 sm:pl-14" aria-label="Attachments">
            {m.attachments.map((a, i) => (
              <li key={`${a.name}-${i}`}>
                <a
                  href={demo ? undefined : `/api/inbox/attachment?m=${m.id}&i=${i}`}
                  aria-disabled={demo || undefined}
                  className="well flex items-center gap-3 px-4 py-2.5 text-[15px] text-[var(--color-text)] transition-shadow hover:shadow-[inset_0_0_0_1px_var(--color-border-bright)]"
                >
                  <DownloadIcon />
                  <span className="max-w-[180px] truncate sm:max-w-[260px]">{a.name}</span>
                  <span className="text-[14px] whitespace-nowrap text-[var(--color-text-dim)]">{fileSize(a.size)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </article>
    </li>
  );
}

