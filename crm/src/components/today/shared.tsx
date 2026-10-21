import type { TodayItem, TodayTone } from "@/lib/store/today";

// Small pieces the hero and the list share. No hooks here, so server and client can both use them.

const AVATAR_TINTS: [string, string][] = [
  ["#2a1d14", "#ffb36b"],
  ["#1b2230", "#a9c0e3"],
  ["#1d2420", "#a9dcb3"],
  ["#262019", "#e0cda8"],
  ["#22262c", "#c6ccd3"],
];

function tintFor(seed: string): [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

export function Avatar({ name, initials, size = 36 }: { name: string; initials: string; size?: number }) {
  const [bg, fg] = tintFor(name);
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size >= 48 ? 16 : 13 }}
    >
      {initials}
    </span>
  );
}

export const TONE_BAR: Record<TodayTone, string> = {
  hot: "bg-[var(--color-livery-red)]",
  warm: "bg-[var(--color-livery-orange)]",
  new: "bg-[var(--color-accent)]",
};

export const TONE_TEXT: Record<TodayTone, string> = {
  hot: "text-[var(--color-hot)] font-medium",
  warm: "text-[var(--color-warm)] font-medium",
  new: "text-[var(--color-text-dim)]",
};

export function money(n: number | null): string {
  return n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;
}

/** The hero's primary button label. */
export function primaryLabel(item: TodayItem): string {
  if (item.action === "call") return `Call ${item.phone}`;
  if (item.action === "send") return item.kind === "followup" ? "Send follow-up" : item.kind === "new" ? "Send email" : "Send reply";
  return item.kind === "followup" ? "Write follow-up" : item.kind === "new" ? "Write email" : "Write reply";
}

/** The list row's button label. */
export function rowLabel(item: TodayItem): string {
  if (item.action === "call") return "Call";
  if (item.kind === "followup") return "Send follow-up";
  if (item.kind === "new") return "Email";
  return "Reply";
}

export function LiveryRail({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`absolute top-0 bottom-0 left-0 flex w-[5px] flex-col ${className}`}>
      <i className="flex-[5] bg-[var(--color-accent)]" />
      <i className="flex-[3] bg-[var(--color-livery-orange)]" />
      <i className="flex-[2] bg-[var(--color-livery-red)]" />
    </span>
  );
}

const WORDS = ["No one", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

/** "Four" for 4, "14" past twelve: numbers as words in ledes. */
export function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}
