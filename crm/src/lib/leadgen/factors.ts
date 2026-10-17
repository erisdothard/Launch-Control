// Max's 11 scoring factors (Launch Control Recap 10/14/26). Keys must match
// tools/leadgen/config.yaml; labels are what the CRM shows.
export const SCORE_FACTORS = [
  { key: "high_ticket_value", label: "High-ticket customer value" },
  { key: "booking_need", label: "Needs more bookings or leads" },
  { key: "decision_maker_size", label: "One decision-maker matters" },
  { key: "owner_accessible", label: "Owner / founder accessible" },
  { key: "recent_activity", label: "Active, recent activity" },
  { key: "niche_fit", label: "Motorsport niche fit" },
  { key: "repeat_potential", label: "Repeat-customer potential" },
  { key: "weak_backend", label: "Weak backend / follow-up" },
  { key: "regional_expansion", label: "Regional expansion potential" },
  { key: "partnership_potential", label: "Partnership potential" },
  { key: "contact_findable", label: "Public business contact" },
] as const;

export const SCORE_BANDS = [
  { min: 80, label: "Hot", className: "bg-[var(--color-accent)] text-[var(--color-on-accent)]" },
  { min: 65, label: "Strong", className: "bg-[var(--color-livery-orange)]/15 text-[var(--color-livery-orange)]" },
  { min: 50, label: "Possible", className: "bg-white/[0.06] text-[var(--color-steel)]" },
  { min: 0, label: "Weak", className: "bg-white/[0.03] text-[var(--color-text-dim)]" },
] as const;

export function scoreBand(score: number | null) {
  if (score === null) return null;
  return SCORE_BANDS.find((band) => score >= band.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

// The handful of signals worth showing a salesperson, pulled out of the raw jsonb.
export function readSignals(signals: Record<string, unknown> | null) {
  const s = signals ?? {};
  return {
    bookingTech: stringList(s.booking_tech),
    crmTech: stringList(s.crm_tech),
    siteBuilder: typeof s.site_builder === "string" ? s.site_builder : null,
    phrases: stringList(s.phrases),
    emails: stringList(s.emails),
    socials:
      typeof s.socials === "object" && s.socials !== null
        ? Object.entries(s.socials as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        : [],
    copyrightYear: typeof s.copyright_year === "number" ? s.copyright_year : null,
    latestEventDate: typeof s.latest_event_date === "string" ? s.latest_event_date : null,
    reviewCount: typeof s.review_count === "number" ? s.review_count : null,
    rating: typeof s.rating === "number" ? s.rating : null,
    mapsUrl: typeof s.maps_url === "string" ? s.maps_url : null,
  };
}
