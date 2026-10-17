"use client";

// Score breakdown and site signals for a lead-gen prospect. Shared by the
// Lead Gen list and the lead detail page.
import type { Lead } from "@/lib/store/types";
import { SCORE_FACTORS, readSignals } from "@/lib/leadgen/factors";

export function FactorBars({ lead }: { lead: Lead }) {
  const breakdown = lead.prospect?.scoreBreakdown ?? {};
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
      {SCORE_FACTORS.map((factor) => {
        const entry = breakdown[factor.key];
        const rating = entry ? Math.max(0, Math.min(5, entry.rating)) : null;
        return (
          <li key={factor.key} title={entry?.evidence || undefined}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-[var(--color-text-muted)]">{factor.label}</span>
              <span className="tabular-nums font-medium text-[var(--color-text)]">{rating ?? "–"}/5</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-secondary)]">
              <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${((rating ?? 0) / 5) * 100}%` }} />
            </div>
            {entry?.evidence && <p className="mt-1 line-clamp-2 text-[11px] text-[var(--color-text-dim)]">{entry.evidence}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function SignalChips({ lead }: { lead: Lead }) {
  const s = readSignals(lead.prospect?.signals ?? null);
  const chips: { label: string; value: string; tone: "warn" | "plain" }[] = [
    {
      label: "Booking",
      value: s.bookingTech.length ? s.bookingTech.join(", ") : "None detected",
      tone: s.bookingTech.length ? "plain" : "warn",
    },
    { label: "CRM", value: s.crmTech.length ? s.crmTech.join(", ") : "None detected", tone: s.crmTech.length ? "plain" : "warn" },
  ];
  if (s.siteBuilder) chips.push({ label: "Site", value: s.siteBuilder, tone: "plain" });
  if (s.latestEventDate) chips.push({ label: "Latest event", value: s.latestEventDate, tone: "plain" });
  if (s.copyrightYear) chips.push({ label: "©", value: String(s.copyrightYear), tone: "plain" });
  if (s.reviewCount !== null) {
    chips.push({ label: "Google", value: `${s.rating ?? "–"}★ · ${s.reviewCount} reviews`, tone: "plain" });
  }
  for (const phrase of s.phrases.slice(0, 3)) chips.push({ label: "Says", value: `“${phrase}”`, tone: "warn" });

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={`${chip.label}-${chip.value}`}
          className={`rounded-full px-2.5 py-1 text-xs ${
            chip.tone === "warn" ? "bg-amber-400/10 text-amber-300" : "bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]"
          }`}
        >
          <span className="font-medium">{chip.label}</span> {chip.value}
        </span>
      ))}
    </div>
  );
}
