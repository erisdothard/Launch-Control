"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EmailDraft } from "@/lib/store/drafts";
import LocalTime from "@/components/admin/LocalTime";
import { discardDraftAction, sendDraftAction } from "./actions";

const inputClass =
  "w-full rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/30";

type Edits = Record<string, { subject: string; body: string }>;

function kindLabel(d: EmailDraft): string {
  return d.kind === "reply" ? "Reply" : `Follow-up ${d.followUpNumber ?? ""}`.trim();
}

function DraftCard({
  draft,
  edit,
  onEdit,
  onSend,
  onDiscard,
  busy,
  error,
}: {
  draft: EmailDraft;
  edit: { subject: string; body: string };
  onEdit: (next: { subject: string; body: string }) => void;
  onSend: () => void;
  onDiscard: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const rows = Math.min(14, Math.max(5, edit.body.split("\n").length + 1));

  return (
    <li className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-border)] px-5 py-3">
        <span
          className={`rounded-[2px] px-2 py-0.5 text-[11px] font-medium ${
            draft.kind === "reply" ? "bg-teal-400/10 text-teal-300" : "bg-amber-400/10 text-amber-300"
          }`}
        >
          {kindLabel(draft)}
        </span>
        <Link href={`/admin/leads/${draft.leadId}#messages`} className="font-medium text-[var(--color-text)] hover:text-[var(--color-accent)]">
          {draft.businessName}
        </Link>
        <span className="text-sm text-[var(--color-text-dim)]">
          to {draft.contactName ? `${draft.contactName} · ` : ""}
          {draft.to}
        </span>
        <span className="ml-auto text-xs text-[var(--color-text-dim)]">
          drafted <LocalTime iso={draft.createdAt} />
        </span>
      </div>

      {draft.replyingTo && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="block w-full border-b border-[var(--color-border)] bg-white/[0.02] px-5 py-3 text-left"
          aria-expanded={open}
        >
          <span className="label-mono text-[var(--color-text-dim)]">They wrote</span>
          <p className={`mt-1 whitespace-pre-line text-sm text-[var(--color-text-muted)] ${open ? "" : "line-clamp-2"}`}>
            {draft.replyingTo.body.trim() || "(no text)"}
          </p>
        </button>
      )}

      <div className="space-y-3 px-5 py-4">
        <input
          value={edit.subject}
          onChange={(e) => onEdit({ ...edit, subject: e.target.value })}
          aria-label="Subject"
          className={inputClass}
          disabled={busy}
        />
        <textarea
          value={edit.body}
          onChange={(e) => onEdit({ ...edit, body: e.target.value })}
          aria-label="Message"
          rows={rows}
          className={`${inputClass} leading-relaxed`}
          disabled={busy}
        />
        {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSend}
            disabled={busy || !edit.body.trim() || !edit.subject.trim()}
            className="rounded-[2px] bg-[var(--color-accent)] px-4 py-2 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send"}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy}
            className="rounded-[2px] px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-white/[0.05] hover:text-[var(--color-text)] disabled:opacity-50"
          >
            Discard
          </button>
          <span className="ml-auto text-xs text-[var(--color-text-dim)]">Your signature is added when it sends.</span>
        </div>
      </div>
    </li>
  );
}

export default function DraftsClient({ drafts }: { drafts: EmailDraft[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [edits, setEdits] = useState<Edits>(() =>
    Object.fromEntries(drafts.map((d) => [d.id, { subject: d.subject, body: d.body }]))
  );
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>(() =>
    Object.fromEntries(drafts.filter((d) => d.error).map((d) => [d.id, `Last try failed: ${d.error}`]))
  );
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const visible = drafts.filter((d) => !gone.has(d.id));
  const editFor = (d: EmailDraft) => edits[d.id] ?? { subject: d.subject, body: d.body };

  async function send(d: EmailDraft): Promise<boolean> {
    setBusy((b) => new Set(b).add(d.id));
    const result = await sendDraftAction(d.id, editFor(d));
    setBusy((b) => {
      const next = new Set(b);
      next.delete(d.id);
      return next;
    });
    if (result.ok) {
      setGone((g) => new Set(g).add(d.id));
      setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== d.id)));
      return true;
    }
    setErrors((e) => ({ ...e, [d.id]: result.error }));
    return false;
  }

  function sendOne(d: EmailDraft) {
    startTransition(async () => {
      await send(d);
      router.refresh();
    });
  }

  function sendAll() {
    const queue = visible.filter((d) => editFor(d).body.trim() && editFor(d).subject.trim());
    startTransition(async () => {
      setProgress({ done: 0, total: queue.length });
      for (const [i, d] of queue.entries()) {
        await send(d);
        setProgress({ done: i + 1, total: queue.length });
      }
      setProgress(null);
      router.refresh();
    });
  }

  function discard(d: EmailDraft) {
    setGone((g) => new Set(g).add(d.id));
    startTransition(async () => {
      await discardDraftAction(d.id);
      router.refresh();
    });
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-[2px] border border-dashed border-[var(--color-border-bright)] bg-[var(--color-bg-card)] p-8 text-center text-sm text-[var(--color-text-muted)]">
        All caught up. New drafts show up here when a lead replies or a follow-up comes due.
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-1 mb-4 flex items-center gap-3 bg-[var(--color-bg-primary)]/95 px-1 py-3">
        <button
          type="button"
          onClick={sendAll}
          disabled={progress !== null || busy.size > 0}
          className="rounded-[2px] bg-[var(--color-accent)] px-4 py-2.5 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {progress ? `Sending ${progress.done} of ${progress.total}…` : `Send all ${visible.length}`}
        </button>
        <span className="text-sm text-[var(--color-text-dim)]">Edits you make below go out with Send all.</span>
      </div>
      <ul className="space-y-4">
        {visible.map((d) => (
          <DraftCard
            key={d.id}
            draft={d}
            edit={editFor(d)}
            onEdit={(next) => setEdits((e) => ({ ...e, [d.id]: next }))}
            onSend={() => sendOne(d)}
            onDiscard={() => discard(d)}
            busy={busy.has(d.id)}
            error={errors[d.id] ?? null}
          />
        ))}
      </ul>
    </div>
  );
}
