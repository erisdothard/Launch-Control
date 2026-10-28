import { emailConfig } from "@/lib/email/config";

/** Midnight at the start of the team's day, as a UTC instant. The daily follow-up cap counts from here. */
export function startOfTeamDay(now = new Date(), tz = emailConfig.teamTimeZone): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const noonUtc = new Date(`${day}T12:00:00Z`);
  const noonLocal = new Date(noonUtc.toLocaleString("en-US", { timeZone: tz }));
  const offsetMs = noonUtc.getTime() - noonLocal.getTime();
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + offsetMs).toISOString();
}

/** Who automatic follow-ups are recorded as in email_messages.sent_by. */
export const AUTOMATION_SENDER = "automation";
