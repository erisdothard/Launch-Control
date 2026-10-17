// What Max can pick when he starts a search. Keys must match tools/leadgen/config.yaml (`segments`
// and `states`); the worker drops anything it doesn't recognise.
export const LEADGEN_SEGMENTS = [
  { key: "arrive_and_drive", label: "Arrive & drive" },
  { key: "endurance_team", label: "Endurance team" },
  { key: "race_prep", label: "Race prep shop" },
  { key: "racing_school", label: "Racing school" },
  { key: "hpde", label: "HPDE / track day" },
  { key: "driver_development", label: "Driver development" },
  { key: "club", label: "Motorsport club" },
  { key: "car_builder", label: "Race car manufacturer" },
  { key: "parts", label: "Parts manufacturer" },
  { key: "logistics", label: "Transport & logistics" },
  { key: "sim", label: "Sim racing" },
  { key: "karting", label: "Karting" },
  { key: "experience", label: "Driving experience" },
  { key: "rental", label: "Rental fleet" },
  { key: "trackside", label: "Trackside services" },
] as const;

export const LEADGEN_STATES = [
  "FL", "GA", "NC", "SC", "TN", "VA", "TX", "AZ", "CA", "MI", "OH", "IN", "IL", "WI", "AL", "KY", "WV", "NJ", "PA",
] as const;

// Google Maps searches per run. More searches = more businesses found, a longer run, more scoring.
export const LEADGEN_SIZES = [
  { key: "quick", label: "Quick", detail: "25 searches, ~15 min", maxQueries: 25 },
  { key: "standard", label: "Standard", detail: "100 searches, ~1 hr", maxQueries: 100 },
  { key: "full", label: "Full", detail: "200 searches, ~2 hr", maxQueries: 200 },
] as const;

export type LeadGenSizeKey = (typeof LEADGEN_SIZES)[number]["key"];

// Contact details a search can insist on; businesses without them are dropped before scoring.
export const LEADGEN_REQUIRE = [
  { key: "email", label: "Must have email" },
  { key: "phone", label: "Must have phone" },
] as const;

export type LeadGenRequireKey = (typeof LEADGEN_REQUIRE)[number]["key"];

// Plain-English labels for the worker's stage column.
export const LEADGEN_STAGE_LABELS: Record<string, string> = {
  starting: "Starting up",
  searching: "Searching Google Maps",
  "reading websites": "Reading their websites",
  scoring: "Scoring each business",
  saving: "Saving to the CRM",
};
