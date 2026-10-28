import type { TodayItem } from "@/lib/store/today";

// How the Today list is cut: four groups, one chip per row, and the "Show" filter. Pure helpers,
// so the board, the rows and the panel all agree on the same words.

export type GroupKey = "reply" | "new" | "overdue" | "today";
export type FilterKey = "all" | "reply" | "new" | "followups" | "overdue";

export const GROUPS: { key: GroupKey; label: string; color: string }[] = [
  { key: "reply", label: "Replied, waiting on you", color: "var(--color-hot)" },
  { key: "new", label: "New inquiries", color: "var(--color-success)" },
  { key: "overdue", label: "Follow-ups overdue", color: "var(--color-livery-red)" },
  { key: "today", label: "Follow-ups due today", color: "var(--color-livery-orange)" },
];

export const FILTERS: { key: FilterKey; label: string; test: (i: TodayItem) => boolean }[] = [
  { key: "all", label: "Everything", test: () => true },
  { key: "reply", label: "Replied", test: (i) => i.kind === "reply" },
  { key: "new", label: "New inquiries", test: (i) => i.kind === "new" },
  { key: "followups", label: "All follow-ups", test: (i) => i.kind === "followup" },
  { key: "overdue", label: "Overdue only", test: (i) => groupOf(i) === "overdue" },
];

export function groupOf(item: TodayItem): GroupKey {
  if (item.kind === "reply") return "reply";
  if (item.kind === "new") return "new";
  return (item.lateDays ?? (item.tone === "hot" ? 1 : 0)) > 0 ? "overdue" : "today";
}

export type ChipTone = "reply" | "new" | "overdue" | "today";

/** One chip per row, and it adds what the group header doesn't: how late, not just "overdue". */
export function chipFor(item: TodayItem): { tone: ChipTone; text: string } {
  const g = groupOf(item);
  if (g === "reply") return { tone: "reply", text: "Replied" };
  if (g === "new") return { tone: "new", text: "New inquiry" };
  if (g === "today") return { tone: "today", text: "Due today" };
  const late = item.lateDays ?? 1;
  return { tone: "overdue", text: late === 1 ? "1 day late" : `${late} days late` };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The right-hand time column: "Waiting 19 hours", "Came in 7:58am", "Due Oct 24". */
export function whenFor(item: TodayItem): string {
  if (item.kind !== "followup" || !item.dueOn) return item.waitLabel;
  const [, m, d] = item.dueOn.split("-").map(Number);
  return `Due ${MONTHS[m - 1]} ${d}`;
}

/** The one-line peek between the name and the chip. */
export function peekFor(item: TodayItem): { text: string; quoted: boolean } {
  if (item.quote) return { text: item.quote.text, quoted: true };
  const said = item.note?.said.split(" · ")[0] ?? "";
  if (/follow-up$/i.test(said)) return { text: said, quoted: false };
  return { text: item.note?.text ?? item.summary, quoted: false };
}

/** A drafted email the panel can send from Today. */
export function canSend(item: TodayItem): boolean {
  return item.action === "send" && item.draft !== null;
}

/** "Dana Reyes · Ridge Motorsport" */
export function labelFor(item: TodayItem): string {
  return item.company ? `${item.name} · ${item.company}` : item.name;
}
