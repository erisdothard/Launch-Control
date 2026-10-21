"use client";

import LocalDate from "@/components/admin/LocalDate";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lead } from "@/lib/store/types";
import { updateNextStepAction } from "../actions";

// What happens next on this lead, and when. Shows on Today once due. The rail and the date label
// carry the urgency: hot when overdue, warm when due today, quiet otherwise.

function dueTone(date: string | null, today: string): { label: string; text: string; rail: string } | null {
  if (!date) return null;
  if (date < today) return { label: "Overdue", text: "text-[var(--color-hot)]", rail: "bg-[var(--color-hot)]" };
  if (date === today) return { label: "Due today", text: "text-[var(--color-warm)]", rail: "bg-[var(--color-warm)]" };
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return { label, text: "text-[var(--color-text-muted)]", rail: "bg-[var(--color-border-bright)]" };
}

export default function NextStepCard({ lead, today }: { lead: Lead; today: string }) {
  const router = useRouter();
  const [nextAction, setNextAction] = useState(lead.nextAction);
  const [followUpOn, setFollowUpOn] = useState(lead.followUpOn ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = nextAction !== lead.nextAction || followUpOn !== (lead.followUpOn ?? "");
  const due = dueTone(lead.followUpOn, today);
  const hasStep = Boolean(lead.nextAction || lead.followUpOn);

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
    <section aria-labelledby="next-step-heading" className="card relative overflow-hidden">
      {due && <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[4px] ${due.rail}`} />}
      <div className="p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="next-step-heading" className="text-[17px] font-semibold text-[var(--color-text)]">
            Next step
          </h2>
          {due && <span className={`text-[15px] font-medium ${due.text}`}>{due.label}</span>}
        </div>
        <p className={`mt-2 leading-snug ${lead.nextAction ? "text-[16.5px] text-[var(--color-text)]" : "text-[15px] text-[var(--color-text-dim)]"}`}>
          {lead.nextAction || (hasStep ? "Follow up" : "Nothing planned. Write it down and it shows up on Today when it's due.")}
        </p>
        <p className="mt-1.5 text-sm text-[var(--color-text-dim)]">
          {lead.lastContactedAt ? (
            <>
              Last emailed <LocalDate iso={lead.lastContactedAt} options={{ month: "short", day: "numeric" }} />
            </>
          ) : (
            "Not emailed yet"
          )}
        </p>

        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) save(nextAction, followUpOn);
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-sm text-[var(--color-text-dim)]">What to do</span>
            <input
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="Call about the proposal"
              maxLength={300}
              className="field"
              disabled={pending}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-[var(--color-text-dim)]">Follow up on</span>
            <input type="date" value={followUpOn} onChange={(e) => setFollowUpOn(e.target.value)} className="field tabular" disabled={pending} />
          </label>
          {error && (
            <p role="alert" className="text-[15px] text-[var(--color-hot)]">
              {error}
            </p>
          )}
          <div className="flex items-center gap-4 pt-1">
            <button type="submit" disabled={pending || !dirty} className="btn btn-secondary btn-sm">
              {pending ? "Saving" : "Save"}
            </button>
            {hasStep && (
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
        </form>
      </div>
    </section>
  );
}
