"use client";

// Score breakdown and site signals for a lead-gen prospect. Shared by the
// Lead Gen list and the lead detail page.
import type { Lead } from "@/lib/store/types";
import { SCORE_FACTORS, readSignals, scoreBand } from "@/lib/leadgen/factors";

// Pill classes per score band (globals.css). The band's own className is tuned for the old dark ground.
const BAND_PILL: Record<string, string> = {
  Hot: "pill pill-accent",
  Strong: "pill pill-warn",
  Possible: "pill pill-neutral",
  Weak: "pill pill-neutral",
};

export function bandPillClass(score: number | null): string {
  const band = scoreBand(score);
  return (band && BAND_PILL[band.label]) ?? "pill pill-neutral";
}

/** "82 · Hot" as a pill; "No score" when the scorer has not run. */
export function ScoreBandPill({ score }: { score: number | null }) {
  const band = scoreBand(score);
  if (!band || score === null) return <span className="pill pill-neutral">No score</span>;
  return (
    <span className={`${bandPillClass(score)} tabular-nums`}>
      {score} · {band.label}
    </span>
  );
}

export function FactorBars({ lead }: { lead: Lead }) {
  const breakdown = lead.prospect?.scoreBreakdown ?? {};
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {SCORE_FACTORS.map((factor) => {
        const entry = breakdown[factor.key];
        const rating = entry ? Math.max(0, Math.min(5, entry.rating)) : null;
        return (
          <li key={factor.key} title={entry?.evidence || undefined}>
            <div className="t-small flex items-baseline justify-between gap-2">
              <span className="text-[var(--color-text-muted)]">{factor.label}</span>
              <span className="font-medium tabular-nums text-[var(--color-text)]">{rating ?? "–"}/5</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-secondary)]">
              <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${((rating ?? 0) / 5) * 100}%` }} />
            </div>
            {entry?.evidence && <p className="t-small mt-1 line-clamp-2 text-[var(--color-text-dim)]">{entry.evidence}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function SignalChips({ lead }: { lead: Lead }) {
  const s = readSignals(lead.prospect?.signals ?? null);
  const chips: { label: string; value: string; tone: "warn" | "plain" }[] = [
    ...s.cappedBy.map((why) => ({ label: "Score held down:", value: why, tone: "warn" as const })),
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
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <span key={`${chip.label}-${chip.value}`} className={`pill whitespace-normal ${chip.tone === "warn" ? "pill-warn" : "pill-neutral"}`}>
          <span className="font-medium">{chip.label}</span> {chip.value}
        </span>
      ))}
    </div>
  );
}
