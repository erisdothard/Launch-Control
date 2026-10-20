"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lead } from "@/lib/store/types";
import { followUpState } from "@/lib/leads/followUp";
import { updateNextStepAction } from "../actions";

const inputClass =
  "w-full rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-dim)] outline-none focus:border-[var(--color-accent)]/50";

function lastContacted(iso: string | null): string {
  if (!iso) return "Not contacted yet";
  return `Last emailed ${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

// What happens next on this lead, and when. Shows on the dashboard's "Needs attention" list once due.
export default function NextStepCard({ lead, today }: { lead: Lead; today: string }) {
  const router = useRouter();
  const [nextAction, setNextAction] = useState(lead.nextAction);
  const [followUpOn, setFollowUpOn] = useState(lead.followUpOn ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = nextAction !== lead.nextAction || followUpOn !== (lead.followUpOn ?? "");
  const due = followUpState(lead.followUpOn, today);

  function save(action: string, date: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateNextStepAction(lead.id, action, date || null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="next-step-heading" className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="next-step-heading" className="label-mono text-[var(--color-steel)]">
          Next step
        </h2>
        {due && <span className={`rounded-[2px] px-2 py-0.5 text-[11px] font-medium ${due.className}`}>{due.label}</span>}
      </div>
      <p className="mb-4 text-xs text-[var(--color-text-dim)]">{lastContacted(lead.lastContactedAt)}</p>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-text-muted)]">What to do</span>
          <input
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="e.g. Call about the proposal"
            maxLength={300}
            className={inputClass}
            disabled={pending}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-text-muted)]">Follow up on</span>
          <input type="date" value={followUpOn} onChange={(e) => setFollowUpOn(e.target.value)} className={inputClass} disabled={pending} />
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => save(nextAction, followUpOn)}
            disabled={pending || !dirty}
            className="rounded-[2px] bg-[var(--color-accent)] px-4 py-2 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
          >
            {pending ? "Saving..." : "Save"}
          </button>
          {(lead.nextAction || lead.followUpOn) && (
            <button
              type="button"
              onClick={() => {
                setNextAction("");
                setFollowUpOn("");
                save("", "");
              }}
              disabled={pending}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              Mark done
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
