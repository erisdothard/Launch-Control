// Small presentational pieces the leads list, composer and campaign pages share. No hooks.
import { initials } from "./audience";

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

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const [bg, fg] = tintFor(name);
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size >= 48 ? 16 : 13 }}
    >
      {initials(name)}
    </span>
  );
}

/** A 22px checkbox that reads at arm's length. */
export function Check({
  checked,
  onChange,
  label,
  indeterminate = false,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  indeterminate?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate && !checked;
      }}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="h-[22px] w-[22px] shrink-0 cursor-pointer rounded-[5px] accent-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

/** Pill for a campaign or recipient status. Colour only where it means something. */
export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "live" | "good" | "bad" | "warn" | "dim" }) {
  const tones = {
    neutral: "bg-white/[0.06] text-[var(--color-text-muted)]",
    live: "bg-[var(--color-accent)]/[0.14] text-[var(--color-accent)]",
    good: "bg-[var(--color-success)]/[0.12] text-[var(--color-success)]",
    bad: "bg-[var(--color-hot)]/[0.12] text-[var(--color-hot)]",
    warn: "bg-[var(--color-warm)]/[0.12] text-[var(--color-warm)]",
    dim: "bg-white/[0.04] text-[var(--color-text-dim)]",
  } as const;
  const dots = {
    neutral: "bg-[var(--color-text-dim)]",
    live: "bg-[var(--color-accent)]",
    good: "bg-[var(--color-success)]",
    bad: "bg-[var(--color-hot)]",
    warn: "bg-[var(--color-warm)]",
    dim: "bg-[var(--color-text-dim)]",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13.5px] font-medium whitespace-nowrap ${tones[tone]}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} />
      {label}
    </span>
  );
}

export function campaignTone(status: string): "neutral" | "live" | "good" | "bad" | "warn" | "dim" {
  if (status === "sending") return "live";
  if (status === "scheduled") return "neutral";
  if (status === "sent") return "good";
  if (status === "paused") return "warn";
  return "dim";
}

export function Spinner() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 animate-spin" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
