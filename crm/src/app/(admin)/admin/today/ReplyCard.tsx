"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { ReplyItem } from "@/lib/today/types";
import { WhenLabel } from "./ClockTime";
import { sendReplyAction } from "./actions";

interface ReplyCardProps {
  item: ReplyItem;
  onSent: (leadId: string) => void;
  onBusy: (leadId: string, busy: boolean) => void;
}

const CLAMP_AT = 280;

export default function ReplyCard({ item, onSent, onBusy }: ReplyCardProps) {
  const [body, setBody] = useState(item.draft?.body ?? "");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const long = item.snippet.length > CLAMP_AT;
  const shown = open || !long ? item.snippet : `${item.snippet.slice(0, CLAMP_AT).trimEnd()}…`;
  const rows = Math.min(14, Math.max(6, body.split("\n").length + 2));

  function send() {
    setError(null);
    onBusy(item.leadId, true);
    startTransition(async () => {
      const result = await sendReplyAction({ leadId: item.leadId, draftId: item.draft?.id ?? null, body });
      onBusy(item.leadId, false);
      if (!result.ok) return setError(result.error);
      onSent(item.leadId);
    });
  }

  return (
    <li className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0">
          <Link href={`/admin/leads/${item.leadId}`} className="text-lg font-semibold text-[var(--color-text)] hover:underline">
            {item.businessName}
          </Link>
          {item.contactName && <span className="text-[var(--color-text-muted)]"> · {item.contactName}</span>}
        </p>
        {item.wroteAt && (
          <p className="t-small text-[var(--color-text-dim)]">
            Wrote <WhenLabel iso={item.wroteAt} />
          </p>
        )}
      </div>

      {item.snippet ? (
        <div className="mt-3 border-l-2 border-[var(--color-border-bright)] pl-4">
          {item.wroteSubject && <p className="t-small font-medium text-[var(--color-text-muted)]">{item.wroteSubject}</p>}
          <p className="whitespace-pre-line text-[var(--color-text-muted)]">{shown}</p>
          {long && (
            <button type="button" onClick={() => setOpen(!open)} className="link mt-1 min-h-11 t-small" aria-expanded={open}>
              {open ? "Show less" : "Show the whole message"}
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[var(--color-text-dim)]">
          They wrote back.{" "}
          <Link href={`/admin/leads/${item.leadId}#messages`} className="link">
            Read the conversation
          </Link>
        </p>
      )}

      <div className="mt-4">
        {item.draft && (
          <p className="mb-2 t-small font-medium text-[var(--color-accent-text)]">Drafted for you. Edit if you like, then send.</p>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={rows}
          placeholder="Write your reply"
          aria-label={`Reply to ${item.businessName}`}
          className="input"
          disabled={pending}
        />
        {error && (
          <p role="alert" className="mt-2 t-small text-[var(--color-danger)]">
            {error}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={send} disabled={pending || !body.trim()} className="btn btn-primary">
            {pending ? "Sending…" : "Send"}
          </button>
          <Link href={`/admin/leads/${item.leadId}#messages`} className="btn-quiet">
            Open the conversation
          </Link>
          <span className="t-small text-[var(--color-text-dim)] sm:ml-auto">Your signature is added when it sends.</span>
        </div>
      </div>
    </li>
  );
}
