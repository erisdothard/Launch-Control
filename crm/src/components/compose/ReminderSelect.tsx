"use client";

import { REMINDER_CHOICES } from "./types";

/** "none" or the number of days ("" only while nothing is chosen). */
export type ReminderValue = string;

/** A week, the cadence Max settled on (2026-11-20); he can still pick another before sending. */
export const DEFAULT_REMINDER: ReminderValue = "7";

export function reminderDays(value: ReminderValue): number | null | undefined {
  if (!value) return undefined;
  return value === "none" ? null : Number(value);
}

/** The follow-up reminder Max must pick before a campaign sends (Eris, 2026-11-17). */
export default function ReminderSelect({ value, onChange }: { value: ReminderValue; onChange: (v: ReminderValue) => void }) {
  return (
    <label className="flex items-center gap-2 text-[15px] text-[var(--color-text-muted)]">
      Remind me to follow up
      <select
        aria-label="Remind me to follow up"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field !w-auto !min-h-[40px] !py-1.5"
      >
        <option value="" disabled>
          Pick one
        </option>
        {REMINDER_CHOICES.map((c) => (
          <option key={c.label} value={c.days === null ? "none" : String(c.days)}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
