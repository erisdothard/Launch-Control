"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { EmailDraft } from "@/lib/store/drafts";
import { WhenLabel } from "./ClockTime";
import { discardDraftAction, sendDraftAction } from "../drafts/actions";

interface WaitingDraftsProps {
  drafts: EmailDraft[];
  onGone: (draftId: string) => void;
  onBusy: (key: string, busy: boolean) => void;
}

const CLAMP_AT = 240;

function kindLabel(d: EmailDraft): string {
  return d.kind === "reply" ? "Reply" : `Follow-up${d.followUpNumber ? ` ${d.followUpNumber}` : ""}`;
}

function DraftCard({ draft, busy, error, onSend, onDiscard }: { draft: EmailDraft; busy: boolean; error: string | null; onSend: () => void; onDiscard: () => void }) {
  const [open, setOpen] = useState(false);
  const [theirs, setTheirs] = useState(false);
  const long = draft.body.length > CLAMP_AT;
  const body = open || !long ? draft.body : `${draft.body.slice(0, CLAMP_AT).trimEnd()}…`;

  return (
    <li className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`pill ${draft.kind === "reply" ? "pill-info" : "pill-warn"}`}>{kindLabel(draft)}</span>
        <Link href={`/admin/leads/${draft.leadId}#messages`} className="text-lg font-semibold text-[var(--color-text)] hover:underline">
          {draft.businessName}
        </Link>
        <span className="t-small text-[var(--color-text-dim)]">
          to {draft.contactName ? `${draft.contactName} · ` : ""}
          {draft.to} · drafted <WhenLabel iso={draft.createdAt} />
        </span>
      </div>

      {draft.replyingTo && (
        <div className="mt-3">
          <button type="button" onClick={() => setTheirs(!theirs)} className="link min-h-11 t-small" aria-expanded={theirs}>
            {theirs ? "Hide what they wrote" : "They wrote…"}
          </button>
          {theirs && (
            <p className="mt-1 whitespace-pre-line border-l-2 border-[var(--color-border-bright)] pl-4 text-[var(--color-text-muted)]">
              {draft.replyingTo.body.trim() || "(no text)"}
            </p>
          )}
        </div>
      )}

      <p className="mt-3 font-medium text-[var(--color-text)]">{draft.subject}</p>
      <p className="whitespace-pre-line text-[var(--color-text-muted)]">{body}</p>
      {long && (
        <button type="button" onClick={() => setOpen(!open)} className="link mt-1 min-h-11 t-small" aria-expanded={open}>
          {open ? "Show less" : "Read the whole email"}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 t-small text-[var(--color-danger)]">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onSend} disabled={busy} className="btn btn-secondary">
          {busy ? "Sending…" : "Send"}
        </button>
        <Link href={`/admin/leads/${draft.leadId}#messages`} className="btn-quiet">
          Change it first
        </Link>
        <button type="button" onClick={onDiscard} disabled={busy} className="btn-quiet">
          Discard
        </button>
      </div>
    </li>
  );
}

export default function WaitingDrafts({ drafts, onGone, onBusy }: WaitingDraftsProps) {
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>(() =>
    Object.fromEntries(drafts.filter((d) => d.error).map((d) => [d.id, `Last try failed: ${d.error}`]))
  );
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const mark = (id: string, on: boolean) => {
    setBusy((b) => {
      const next = new Set(b);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    onBusy(`draft-${id}`, on);
  };

  async function send(d: EmailDraft): Promise<boolean> {
    mark(d.id, true);
    const result = await sendDraftAction(d.id);
    mark(d.id, false);
    if (result.ok) {
      setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== d.id)));
      onGone(d.id);
      return true;
    }
    setErrors((e) => ({ ...e, [d.id]: result.error }));
    return false;
  }

  function sendAll() {
    startTransition(async () => {
      setProgress({ done: 0, total: drafts.length });
      for (const [i, d] of drafts.entries()) {
        await send(d);
        setProgress({ done: i + 1, total: drafts.length });
      }
      setProgress(null);
    });
  }

  function discard(d: EmailDraft) {
    mark(d.id, true);
    startTransition(async () => {
      try {
        await discardDraftAction(d.id);
        onGone(d.id);
      } catch {
        setErrors((e) => ({ ...e, [d.id]: "Couldn't discard that. Try again." }));
      } finally {
        mark(d.id, false);
      }
    });
  }

  return (
    <div>
      {drafts.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={sendAll} disabled={progress !== null || busy.size > 0} className="btn btn-primary">
            {progress ? `Sending ${progress.done} of ${progress.total}…` : `Send all ${drafts.length}`}
          </button>
          <span className="t-small text-[var(--color-text-dim)]">They go out one after another, as written.</span>
        </div>
      )}
      <ul className="space-y-3">
        {drafts.map((d) => (
          <DraftCard key={d.id} draft={d} busy={busy.has(d.id)} error={errors[d.id] ?? null} onSend={() => void send(d)} onDiscard={() => discard(d)} />
        ))}
      </ul>
    </div>
  );
}
