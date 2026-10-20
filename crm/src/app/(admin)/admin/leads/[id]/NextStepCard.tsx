"use client";

import LocalDate from "@/components/admin/LocalDate";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lead } from "@/lib/store/types";
import { followUpState } from "@/lib/leads/followUp";
import { updateNextStepAction } from "../actions";

function lastContacted(iso: string | null) {
  if (!iso) return "Not contacted yet";
  return (
    <>
      Last emailed <LocalDate iso={iso} options={{ month: "short", day: "numeric" }} />
    </>
  );
}

// What happens next on this lead, and when. This is the task system: once the date comes, the
// lead shows up on Today and under "Follow-up due".
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
    <section aria-labelledby="next-step-heading" className="card p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="next-step-heading" className="label-mono text-[var(--color-steel)]">
          Next step &amp; follow-up date
        </h2>
        {due && <span className={due.className}>{due.label}</span>}
      </div>
      <p className="t-small mb-4 text-[var(--color-text-dim)]">{lastContacted(lead.lastContactedAt)}</p>
      <div className="space-y-3">
        <label className="block">
          <span className="t-small mb-1 block text-[var(--color-text-muted)]">What to do</span>
          <input
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="e.g. Call about the proposal"
            maxLength={300}
            className="input"
            disabled={pending}
          />
        </label>
        <label className="block">
          <span className="t-small mb-1 block text-[var(--color-text-muted)]">Follow up on</span>
          <input type="date" value={followUpOn} onChange={(e) => setFollowUpOn(e.target.value)} className="input" disabled={pending} />
        </label>
        {error && (
          <p role="alert" className="t-small text-[var(--color-danger)]">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => save(nextAction, followUpOn)} disabled={pending || !dirty} className="btn btn-primary">
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
              className="btn-quiet"
            >
              Mark done
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
