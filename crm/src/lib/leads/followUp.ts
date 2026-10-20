// Follow-up dates are plain YYYY-MM-DD in the team's local day, so compare as strings against
// today's local date rather than through Date (which would shift them by the UTC offset).
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// The team's calendar day wherever the code runs (Vercel is UTC): the database's team_today().
export function teamTodayISO(now: Date = new Date(), timeZone = "America/Chicago"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export interface FollowUpState {
  label: string;
  className: string;
  dueNow: boolean;
}

export function followUpState(date: string | null, today: string = todayISO()): FollowUpState | null {
  if (!date) return null;
  if (date < today) return { label: "Overdue", className: "bg-red-400/15 text-red-300", dueNow: true };
  if (date === today) return { label: "Due today", className: "bg-[var(--color-accent)]/15 text-[var(--color-accent)]", dueNow: true };
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { label, className: "bg-white/[0.06] text-[var(--color-text-muted)]", dueNow: false };
}
