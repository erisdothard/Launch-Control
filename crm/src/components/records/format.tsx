// Small shared pieces for record screens: initials avatar, money, and "how long since we touched it".

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function formatMoney(value: number): string {
  return money.format(value);
}

/** "$214k" style, for column headers and tight spots. */
export function formatMoneyShort(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}m`;
  if (value >= 10_000) return `$${Math.round(value / 1000)}k`;
  return money.format(value);
}

// Muted, dark-ground avatar pairs from the mock (background, ink). Picked by name so a record
// keeps its colour everywhere it appears.
const AVATAR_PAIRS: [string, string][] = [
  ["#2a1d14", "#ffb36b"],
  ["#1b2230", "#a9c0e3"],
  ["#1d2420", "#a9dcb3"],
  ["#262019", "#e0cda8"],
  ["#22262c", "#c6ccd3"],
  ["#241c24", "#d9b3d6"],
];

export function initialsOf(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words[0][0] + (words.length > 1 ? words[1][0] : "")).toUpperCase();
}

interface AvatarProps {
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ name, size = 36, className = "" }: AvatarProps) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, ink] = AVATAR_PAIRS[hash % AVATAR_PAIRS.length];
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${className}`}
      style={{ width: size, height: size, background: bg, color: ink, fontSize: Math.max(13, Math.round(size * 0.33)) }}
    >
      {initialsOf(name)}
    </span>
  );
}

export type Staleness = "fresh" | "warm" | "hot";

/** Whole days between an ISO time and now (server-supplied, so server and browser agree). */
export function daysSince(iso: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 86_400_000));
}

/** A week without a touch is worth a look; two weeks is going cold. */
export function staleness(days: number): Staleness {
  if (days >= 14) return "hot";
  if (days >= 7) return "warm";
  return "fresh";
}

export function sinceLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (days < 60) return weeks === 1 ? "A week ago" : `${weeks} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

export const STALE_CLASS: Record<Staleness, string> = {
  fresh: "text-[var(--color-text-dim)]",
  warm: "text-[var(--color-warm)]",
  hot: "text-[var(--color-hot)]",
};
