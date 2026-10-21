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
    <label className="flex cursor-pointer items-start justify-between gap-6 py-5">
      <span>
        <span className="block text-base font-medium text-[var(--color-text)]">{label}</span>
        <span className="mt-1 block max-w-2xl text-sm leading-relaxed text-[var(--color-text-muted)]">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-50 ${
          checked ? "bg-[var(--color-success)]" : "bg-[var(--color-bg-secondary)] shadow-[inset_0_0_0_1px_var(--color-border-bright)]"
        }`}
      >
        <span
          className={`absolute top-1 left-1 h-5 w-5 rounded-full transition-transform duration-200 ease-[var(--ease-out-expo)] ${checked ? "translate-x-5 bg-[var(--color-on-accent)]" : "bg-[var(--color-steel)]"}`}
        />
      </button>
    </label>
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
    <section id="automation" aria-labelledby="automation-heading" className="card p-5 sm:p-8">
      <h2 id="automation-heading" className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-steel)]">
        What the CRM does on its own
      </h2>
      <p className="mt-2 max-w-2xl text-base text-[var(--color-text-muted)]">
        Lead statuses move on their own: an email out marks a lead contacted, a reply marks it replied, a meeting on the
        calendar marks it meeting, and a deal carries it to proposal, won or lost. Anyone who writes back asking to stop is
        never emailed again.
      </p>

      <div className="mt-4 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
        <Toggle
          checked={settings.draftReplies}
          onChange={(v) => save({ draftReplies: v })}
          label="Draft replies"
          hint="When a lead writes back, a reply is written for you in Drafts. You read it and send it."
          disabled={pending}
        />
        <Toggle
          checked={settings.autoSendFollowUps}
          onChange={(v) => save({ autoSendFollowUps: v })}
          label="Send follow-ups automatically"
          hint={`Leads who haven't answered get a short follow-up 3 business days after each email, up to ${maxFollowUps}, from the address the thread is on, stopping the moment they reply. Off: the follow-ups wait in Drafts for you to send. A lead with no answer ${settings.coldAfterDays} days after the last one is closed as gone cold.`}
          disabled={pending}
        />
        <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <span>
            <span className="block text-base font-medium text-[var(--color-text)]">Daily limit</span>
            <span className="mt-1 block text-sm text-[var(--color-text-muted)]">
              The most automatic follow-ups sent in one day, to protect the mailbox&apos;s reputation.
            </span>
          </span>
          <form
            className="flex items-center gap-2"
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
              className="field w-24 tabular"
            />
            <button
              type="submit"
              disabled={pending || cap === String(settings.dailySendCap)}
              className="btn btn-secondary btn-sm"
            >
              Save
            </button>
          </form>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-[var(--color-hot)]" role="alert">{error}</p>}
    </section>
  );
}
