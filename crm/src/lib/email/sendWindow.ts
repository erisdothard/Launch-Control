// When campaign mail may go out. Pure (no imports), so node's test runner can load it directly.

/** Campaign mail goes out on weekdays between these hours, team time. */
export const SEND_WINDOW = { startHour: 8, endHour: 17 } as const;

/**
 * How far through the team's sending window `now` is, 0 to 1; null outside it (a weekend, or
 * before or after business hours). Campaigns spread each day's batch across this window.
 */
export function sendWindowProgress(now: Date, tz: string): number | null {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  if (part("weekday") === "Sat" || part("weekday") === "Sun") return null;
  const minutes = Number(part("hour")) * 60 + Number(part("minute"));
  const start = SEND_WINDOW.startHour * 60;
  const end = SEND_WINDOW.endHour * 60;
  if (!Number.isFinite(minutes) || minutes < start || minutes >= end) return null;
  return (minutes - start) / (end - start);
}
