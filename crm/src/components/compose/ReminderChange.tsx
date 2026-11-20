"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeCampaignReminderAction } from "@/app/(admin)/admin/campaigns/actions";
import ReminderSelect, { reminderDays, type ReminderValue } from "./ReminderSelect";
import { REMINDER_CHOICES } from "./types";
import { Spinner } from "./ui";

const asValue = (days: number | null): ReminderValue => (days === null ? "none" : String(days));

/**
 * The follow-up reminder on a campaign that has been sent, and a way to change it afterwards
 * (Max, 2026-11-20: "if there's a way to change the follow up schedule after having set it").
 * Saving moves the reminder on every lead still waiting on this campaign's first email.
 */
export default function ReminderChange({ id, days, demo }: { id: string; days: number | null; demo: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<ReminderValue>(asValue(days));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const label = REMINDER_CHOICES.find((c) => c.days === days)?.label ?? (days === null ? "No reminder" : `In ${days} days`);

  function save() {
    const chosen = reminderDays(value);
    if (chosen === undefined) return;
    setError("");
    if (demo) return setError("Demo mode: nothing changes.");
    start(async () => {
      const result = await changeCampaignReminderAction(id, chosen);
      if (!result.ok) return setError(result.error);
      setNote(result.moved === 1 ? "1 lead moved to the new date." : `${result.moved} leads moved to the new date.`);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] text-[var(--color-text-dim)]">
      {editing ? (
        <>
          <ReminderSelect value={value} onChange={setValue} />
          <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={save}>
            {pending && <Spinner />}
            Save
          </button>
          <button type="button" className="btn-quiet" disabled={pending} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <span>Follow-up reminder: {label.charAt(0).toLowerCase() + label.slice(1)}.</span>
          <button type="button" className="btn-quiet" onClick={() => setEditing(true)}>
            Change
          </button>
          {note && <span role="status">{note}</span>}
        </>
      )}
      {error && (
        <span role="alert" className="text-[var(--color-hot)]">
          {error}
        </span>
      )}
    </div>
  );
}
