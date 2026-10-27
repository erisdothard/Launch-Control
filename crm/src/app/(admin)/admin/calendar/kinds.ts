// Calendar kinds and the ?show= filter. Pure, so the server page can parse the URL too.

// Four kinds, each a small coloured bar (never a filled surface) and a switch above the grid:
// meetings (an event with a lead), other events (Outlook, or no lead), follow-ups and tasks.
export type CalendarKind = "meeting" | "event" | "followup" | "task";
export const KINDS: { key: CalendarKind; label: string }[] = [
  { key: "meeting", label: "Meetings" },
  { key: "event", label: "Other events" },
  { key: "followup", label: "Follow-ups" },
  { key: "task", label: "Tasks" },
];
export const KIND_BAR: Record<CalendarKind, string> = {
  meeting: "bg-[var(--color-accent)]",
  event: "bg-[var(--color-success)]",
  followup: "bg-[var(--color-livery-orange)]",
  task: "bg-[var(--color-steel)]",
};
export const KIND_LABEL = { followup: "Follow-up", task: "Task" } as const;
// Appointments first: follow-ups live on Today, so they start hidden here and are one click away.
export const DEFAULT_SHOW: CalendarKind[] = ["meeting", "event", "task"];

/** ?show=meeting,event from the URL; the default when absent or empty. */
export function parseShow(value: string | undefined): CalendarKind[] {
  if (value === undefined) return DEFAULT_SHOW;
  if (value === "none") return [];
  const keys = value.split(",").filter((v): v is CalendarKind => KINDS.some((k) => k.key === v));
  return keys.length ? keys : DEFAULT_SHOW;
}

