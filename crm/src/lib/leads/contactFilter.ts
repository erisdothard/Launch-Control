// "Has email / Has phone / Named contact / Has website" filter, shared by Leads, Lead Gen and the
// CSV export. Lives in the URL as ?has=email,phone so a filtered view can be bookmarked or shared.
export const CONTACT_FILTERS = [
  { key: "email", label: "Has email" },
  { key: "phone", label: "Has phone" },
  { key: "contact", label: "Named contact" },
  { key: "website", label: "Has website" },
] as const;

export type ContactFilterKey = (typeof CONTACT_FILTERS)[number]["key"];

const KEYS = new Set<string>(CONTACT_FILTERS.map((f) => f.key));

export function parseHas(value: string | undefined): ContactFilterKey[] {
  if (!value) return [];
  return [...new Set(value.split(","))].filter((v): v is ContactFilterKey => KEYS.has(v));
}
