"use client";

// v2: a soft pill with a dot. Colour only where it means something (tokens.css):
// hot = they replied and it's our move, success = won/customer, steel = in play, dim = closed.
// (warm stays reserved for "due today" and lives on dates, not statuses.)
// Everything else stays neutral so a list of badges never turns into confetti.
type BadgeVariant = "lead" | "deal";
type Tone = "neutral" | "steel" | "hot" | "warm" | "success" | "closed";

interface StatusBadgeProps {
  status: string;
  variant?: BadgeVariant;
}

interface BadgeMeta {
  label: string;
  tone: Tone;
}

const LEAD: Record<string, BadgeMeta> = {
  new: { label: "New", tone: "neutral" },
  contacted: { label: "Contacted", tone: "neutral" },
  replied: { label: "Replied", tone: "hot" },
  meeting: { label: "Meeting set", tone: "steel" },
  proposal: { label: "Proposal out", tone: "steel" },
  negotiation: { label: "Negotiating", tone: "steel" },
  converted: { label: "Customer", tone: "success" },
  lost: { label: "Closed", tone: "closed" },
  nurture: { label: "Gone quiet", tone: "neutral" },
};

const DEAL: Record<string, BadgeMeta> = {
  inquiry: { label: "Inquiry", tone: "neutral" },
  proposal: { label: "Proposal out", tone: "steel" },
  negotiation: { label: "Negotiating", tone: "steel" },
  won: { label: "Won", tone: "success" },
  lost: { label: "Lost", tone: "closed" },
};

const TONE: Record<Tone, { pill: string; dot: string }> = {
  neutral: { pill: "bg-white/[0.06] text-[var(--color-text-muted)]", dot: "bg-[var(--color-text-dim)]" },
  steel: { pill: "bg-[var(--color-steel)]/[0.12] text-[var(--color-text)]", dot: "bg-[var(--color-steel)]" },
  hot: { pill: "bg-[var(--color-hot)]/[0.12] text-[var(--color-hot)]", dot: "bg-[var(--color-hot)]" },
  warm: { pill: "bg-[var(--color-warm)]/[0.12] text-[var(--color-warm)]", dot: "bg-[var(--color-warm)]" },
  success: { pill: "bg-[var(--color-success)]/[0.12] text-[var(--color-success)]", dot: "bg-[var(--color-success)]" },
  closed: { pill: "bg-white/[0.04] text-[var(--color-text-dim)]", dot: "bg-white/25" },
};

/** The plain-English label for a status, for places that need the words without the pill. */
export function statusLabel(status: string, variant: BadgeVariant = "lead"): string {
  const map = variant === "deal" ? DEAL : LEAD;
  return map[status]?.label ?? status.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export default function StatusBadge({ status, variant = "lead" }: StatusBadgeProps) {
  const map = variant === "deal" ? DEAL : LEAD;
  const tone = TONE[map[status]?.tone ?? "neutral"];

  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full py-1 pr-3 pl-2.5 text-sm leading-none font-medium ${tone.pill}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {statusLabel(status, variant)}
    </span>
  );
}
