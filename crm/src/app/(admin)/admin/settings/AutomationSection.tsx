"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AutomationSettings } from "@/lib/store/drafts";
import { updateAutomationAction } from "../drafts/actions";

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint: string;
  disabled: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <span>
        <span className="block text-base font-semibold text-[var(--color-text)]">{label}</span>
        <span className="mt-1 block text-base text-[var(--color-text-muted)]">{hint}</span>
      </span>
      {/* 44px hit area around a 28px switch */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="flex h-11 w-16 shrink-0 cursor-pointer items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          className={`relative block h-7 w-12 rounded-full transition-colors ${checked ? "bg-[var(--color-accent)]" : "bg-[var(--color-border-bright)]"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 block h-6 w-6 rounded-full bg-[var(--color-bg-card)] shadow-sm transition-transform ${checked ? "translate-x-5" : ""}`}
          />
        </span>
        <span className="sr-only">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

export default function AutomationSection({ settings }: { settings: AutomationSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cap, setCap] = useState(String(settings.dailySendCap));

  function save(patch: Partial<AutomationSettings>) {
    setError(null);
    startTransition(async () => {
      const result = await updateAutomationAction(patch);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  const maxFollowUps = settings.followUpDays.length;

  return (
    <section id="automation" aria-labelledby="automation-heading" className="card mt-6 max-w-3xl p-5 sm:p-6">
      <h2 id="automation-heading" className="label-mono text-[var(--color-steel)]">
        Automation
      </h2>
      <p className="mt-2 max-w-2xl text-base text-[var(--color-text-muted)]">
        Lead statuses move on their own: an email out marks a lead contacted, a reply marks it replied, a meeting on the calendar marks
        it meeting, and a deal carries it to proposal, won or lost. Anyone who writes back asking to stop is never emailed again.
      </p>

      <div className="mt-4 divide-y divide-[var(--color-border)]">
        <Toggle
          checked={settings.draftReplies}
          onChange={(v) => save({ draftReplies: v })}
          label="Draft replies"
          hint="When a lead writes back, a reply is written for you and waits on Today. You read it and send it."
          disabled={pending}
        />
        <Toggle
          checked={settings.autoSendFollowUps}
          onChange={(v) => save({ autoSendFollowUps: v })}
          label="Send follow-ups automatically"
          hint={`Leads who haven't answered get a short follow-up 3 business days after each email, up to ${maxFollowUps}, from the address the thread is on, stopping the moment they reply. Off: the follow-ups wait on Today for you to send. A lead with no answer ${settings.coldAfterDays} days after the last one is closed as gone cold.`}
          disabled={pending}
        />
        <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <span>
            <span className="block text-base font-semibold text-[var(--color-text)]">Daily limit</span>
            <span className="mt-1 block text-base text-[var(--color-text-muted)]">
              The most automatic follow-ups sent in one day, to protect the mailbox&apos;s reputation.
            </span>
          </span>
          <form
            className="flex shrink-0 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save({ dailySendCap: Number(cap) });
            }}
          >
            <input
              type="number"
              min={0}
              max={200}
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              aria-label="Daily limit"
              className="input w-24"
            />
            <button type="submit" disabled={pending || cap === String(settings.dailySendCap)} className="btn btn-secondary">
              Save
            </button>
          </form>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-base text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
