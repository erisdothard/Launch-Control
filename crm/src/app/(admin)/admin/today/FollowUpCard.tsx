"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { FollowUpItem } from "@/lib/today/types";
import { updateNextStepAction } from "../leads/actions";
import { sendDraftAction } from "../drafts/actions";

interface FollowUpCardProps {
  item: FollowUpItem;
  /** Today + 7 days, YYYY-MM-DD, worked out by the server in the team's zone. */
  snoozeTo: string;
  onDone: (leadId: string) => void;
  onBusy: (leadId: string, busy: boolean) => void;
}

export default function FollowUpCard({ item, snoozeTo, onDone, onBusy }: FollowUpCardProps) {
  const [showDraft, setShowDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [doing, setDoing] = useState<"send" | "done" | "snooze" | null>(null);
  const showNext = item.nextAction && !item.line.includes(item.nextAction);

  function run(kind: "send" | "done" | "snooze", work: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    setDoing(kind);
    onBusy(item.leadId, true);
    startTransition(async () => {
      const result = await work();
      onBusy(item.leadId, false);
      setDoing(null);
      if (!result.ok) return setError(result.error);
      onDone(item.leadId);
    });
  }

  const sendDraft = () => item.draft && run("send", () => sendDraftAction(item.draft!.id));
  const markDone = () => run("done", () => updateNextStepAction(item.leadId, "", null));
  const snooze = () => run("snooze", () => updateNextStepAction(item.leadId, item.nextAction, snoozeTo));

  return (
    <li className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <Link href={`/admin/leads/${item.leadId}`} className="text-lg font-semibold text-[var(--color-text)] hover:underline">
            {item.businessName}
          </Link>
          <p className="text-[var(--color-text-muted)]">{item.line}</p>
          {showNext && <p className="text-[var(--color-text)]">Next: {item.nextAction}</p>}
          {item.draft && (
            <button type="button" onClick={() => setShowDraft(!showDraft)} className="link mt-1 min-h-11 t-small" aria-expanded={showDraft}>
              {showDraft ? "Hide the draft" : "Read the drafted follow-up"}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.draft ? (
            <button type="button" onClick={sendDraft} disabled={pending} className="btn btn-primary">
              {doing === "send" ? "Sending…" : "Send drafted follow-up"}
            </button>
          ) : (
            <Link href={`/admin/leads/${item.leadId}#messages`} className="btn btn-primary">
              Email
            </Link>
          )}
          <button type="button" onClick={markDone} disabled={pending} className="btn-quiet">
            {doing === "done" ? "Saving…" : "Mark done"}
          </button>
          <button type="button" onClick={snooze} disabled={pending} className="btn-quiet">
            {doing === "snooze" ? "Saving…" : "Snooze a week"}
          </button>
        </div>
      </div>
      {item.draft && showDraft && (
        <div className="mt-3 border-l-2 border-[var(--color-border-bright)] pl-4">
          <p className="t-small font-medium text-[var(--color-text-muted)]">{item.draft.subject}</p>
          <p className="whitespace-pre-line text-[var(--color-text-muted)]">{item.draft.body}</p>
          <Link href={`/admin/leads/${item.leadId}#messages`} className="link mt-1 inline-block min-h-11 t-small">
            Change it before sending
          </Link>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 t-small text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </li>
  );
}
