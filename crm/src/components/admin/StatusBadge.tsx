"use client";

// A lead's or deal's status as a plain-word pill. Thin wrapper over the .pill classes in globals.css
// so Leads, Lead Gen and Deals all say the same thing the same way.
type BadgeVariant = "lead" | "deal";

interface StatusBadgeProps {
  status: string;
  variant?: BadgeVariant;
}

interface PillSpec {
  label: string;
  className: string;
}

const LEAD: Record<string, PillSpec> = {
  new: { label: "Not contacted", className: "pill pill-neutral" },
  contacted: { label: "Contacted", className: "pill pill-info" },
  replied: { label: "Replied", className: "pill pill-danger" },
  meeting: { label: "Meeting", className: "pill pill-info" },
  proposal: { label: "Proposal", className: "pill pill-info" },
  negotiation: { label: "Negotiating", className: "pill pill-warn" },
  converted: { label: "Customer", className: "pill pill-ok" },
  lost: { label: "Closed", className: "pill pill-neutral" },
};

const DEAL: Record<string, PillSpec> = {
  inquiry: { label: "Inquiry", className: "pill pill-neutral" },
  proposal: { label: "Proposal", className: "pill pill-info" },
  negotiation: { label: "Negotiating", className: "pill pill-warn" },
  won: { label: "Won", className: "pill pill-ok" },
  lost: { label: "Lost", className: "pill pill-neutral" },
};

const SPECS: Record<BadgeVariant, Record<string, PillSpec>> = { lead: LEAD, deal: DEAL };

export default function StatusBadge({ status, variant = "lead" }: StatusBadgeProps) {
  const spec = SPECS[variant][status] ?? { label: status.replace(/[-_]/g, " "), className: "pill pill-neutral" };
  return <span className={spec.className}>{spec.label}</span>;
}
