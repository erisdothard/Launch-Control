"use client";

// "deal" stages genericized to a universal sales pipeline (Hyper Racer's had
// car-build-specific stages: deposit/build-order/in-production/shipping).
// The "event" variant was dropped — events aren't part of this shell.
// Translucent tints with light text, for the dark Launch Control ground.
type BadgeVariant = "lead" | "deal";

interface StatusBadgeProps {
  status: string;
  variant?: BadgeVariant;
}

const leadColors: Record<string, string> = {
  new: "bg-[var(--color-steel)]/10 text-[var(--color-steel)]",
  contacted: "bg-amber-400/10 text-amber-300",
  qualified: "bg-green-400/10 text-green-300",
  proposal: "bg-purple-400/10 text-purple-300",
  negotiation: "bg-[var(--color-livery-orange)]/15 text-[var(--color-livery-orange)]",
  converted: "bg-emerald-400/10 text-emerald-300",
  lost: "bg-red-400/10 text-red-300",
};

const dealColors: Record<string, string> = {
  inquiry: "bg-[var(--color-steel)]/10 text-[var(--color-steel)]",
  proposal: "bg-purple-400/10 text-purple-300",
  negotiation: "bg-amber-400/10 text-amber-300",
  won: "bg-emerald-400/10 text-emerald-300",
  lost: "bg-red-400/10 text-red-300",
};

const colorMaps: Record<BadgeVariant, Record<string, string>> = {
  lead: leadColors,
  deal: dealColors,
};

export default function StatusBadge({ status, variant = "lead" }: StatusBadgeProps) {
  const colors = colorMaps[variant][status] ?? "bg-white/[0.06] text-[var(--color-text-muted)]";
  const displayLabel = status.replace(/-/g, " ");

  return (
    <span className={`inline-flex items-center rounded-[2px] px-2 py-0.5 text-xs font-medium capitalize ${colors}`}>
      {displayLabel}
    </span>
  );
}
