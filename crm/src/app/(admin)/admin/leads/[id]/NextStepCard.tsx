"use client";

import Link from "next/link";
import LocalDate from "@/components/admin/LocalDate";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SparkIcon } from "@/components/records/icons";
import { inboxHref } from "@/components/inbox/url";
import type { Lead } from "@/lib/store/types";
import { updateNextStepAction } from "../actions";

// The record's one "what happens next" block, inside the hero: the next step and its date, the
// drafted email if the CRM wrote one, and a Change link that opens the editor in place. It replaces
// the separate Next step card and the hero's own follow-up signal, which said the same thing twice.

export interface StepDraft {
  id: string;
  kind: "reply" | "follow_up";
  followUpNumber: number | null;
  body: string;
}

function dueTone(date: string | null, today: string): { label: string; text: string } | null {
  if (!date) return null;
  if (date < today) return { label: "Overdue", text: "text-[var(--color-hot)]" };
  if (date === today) return { label: "Due today", text: "text-[var(--color-warm)]" };
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return { label, text: "text-[var(--color-text-muted)]" };
}

/** What the step is when nobody typed one: read from whose move it is. */
function impliedStep(lead: Lead): string {
  if (lead.awaiting === "us") return "Reply to them";
  if (lead.status === "nurture") return "Check in now and then";
  if (lead.awaiting === "them") return "Wait for their answer";
  return "Nothing planned";
}

export default function NextStep({ lead, today, draft }: { lead: Lead; today: string; draft: StepDraft | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [nextAction, setNextAction] = useState(lead.nextAction);
  const [followUpOn, setFollowUpOn] = useState(lead.followUpOn ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = nextAction !== lead.nextAction || followUpOn !== (lead.followUpOn ?? "");
  const due = dueTone(lead.followUpOn, today);
  const hasStep = Boolean(lead.nextAction || lead.followUpOn);
  const step = lead.nextAction || impliedStep(lead);

  function save(action: string, date: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateNextStepAction(lead.id, action, date || null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="next-step-heading" className="well mt-5 px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="next-step-heading" className="text-[14px] font-normal text-[var(--color-text-dim)]">
          Next step
        </h2>
        <p className={`order-last min-w-0 basis-full text-[16.5px] leading-snug sm:order-none sm:flex-1 sm:basis-0 ${hasStep || lead.awaiting ? "text-[var(--color-text)]" : "text-[var(--color-text-dim)]"}`}>
          {step}
          {due && <span className={`ml-2 text-[15px] font-medium ${due.text}`}>{due.label === "Overdue" || due.label === "Due today" ? due.label : `on ${due.label}`}</span>}
        </p>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="btn-quiet ml-auto text-[15px] sm:ml-0">
            Change
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-[var(--color-text-dim)]">
        {lead.lastContactedAt ? (
          <>
            Last emailed <LocalDate iso={lead.lastContactedAt} options={{ month: "short", day: "numeric" }} />
            {lead.followUpCount > 0 && ` · ${lead.followUpCount} follow-up${lead.followUpCount === 1 ? "" : "s"} so far`}
          </>
        ) : (
          "Not emailed yet"
        )}
      </p>

      {draft && !editing && (
        <div className="mt-3 border-t border-[var(--color-border)] pt-3">
          <p className="flex items-center gap-2 text-sm text-[var(--color-text-dim)]">
            <SparkIcon />
            {draft.kind === "reply" ? "Your reply, drafted" : `Follow-up ${draft.followUpNumber ?? ""}, drafted`}
          </p>
          <p className="mt-1.5 line-clamp-3 text-[16px] leading-[1.6] whitespace-pre-line text-[var(--color-text)]">{draft.body}</p>
          <Link href={inboxHref({ folder: "drafts", draft: draft.id })} className="btn-quiet mt-2 inline-block text-[15px]">
            Review and send
          </Link>
        </div>
      )}

      {editing && (
        <form
          className="mt-3 grid grid-cols-1 gap-3 border-t border-[var(--color-border)] pt-3 sm:grid-cols-[minmax(0,1fr)_11rem]"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) save(nextAction, followUpOn);
            else setEditing(false);
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
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-[var(--color-text-dim)]">On</span>
            <input type="date" value={followUpOn} onChange={(e) => setFollowUpOn(e.target.value)} className="field tabular" disabled={pending} />
          </label>
          {error && (
            <p role="alert" className="text-[15px] text-[var(--color-hot)] sm:col-span-2">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <button type="submit" disabled={pending} className="btn btn-secondary btn-sm">
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
            <button
              type="button"
              onClick={() => {
                setNextAction(lead.nextAction);
                setFollowUpOn(lead.followUpOn ?? "");
                setEditing(false);
              }}
              className="btn-quiet"
            >
              Cancel
            </button>
            <span className="text-sm text-[var(--color-text-dim)]">It shows on Today when the date comes.</span>
          </div>
        </form>
      )}
    </section>
  );
}
