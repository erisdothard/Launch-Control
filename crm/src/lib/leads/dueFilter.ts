// The follow-up date filter on Leads (?due=overdue|today|upcoming|none). Works inside any view, so
// "Follow-up due" can be split into overdue and due today, and "Waiting on them" into what's coming.
// Dates are team-local YYYY-MM-DD strings, compared as strings (see followUp.ts).
export const DUE_FILTERS = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "none", label: "No date" },
] as const;

export type DueFilterKey = (typeof DUE_FILTERS)[number]["key"];

export function parseDue(value: string | undefined): DueFilterKey | null {
  return DUE_FILTERS.find((f) => f.key === value)?.key ?? null;
}

export function dueBucket(followUpOn: string | null, today: string): DueFilterKey {
  if (!followUpOn) return "none";
  if (followUpOn < today) return "overdue";
  if (followUpOn === today) return "today";
  return "upcoming";
}

/** Soonest first (the most overdue at the top); leads with no date go last, newest first as before. */
export function byFollowUpDate<T extends { followUpOn: string | null }>(leads: T[]): T[] {
  return [...leads].sort((a, b) => {
    if (a.followUpOn === b.followUpOn) return 0;
    if (!a.followUpOn) return 1;
    if (!b.followUpOn) return -1;
    return a.followUpOn < b.followUpOn ? -1 : 1;
  });
}
