// The order of the main nav (sidebar and the phone tab bar), per user. Pure helpers: safe on the
// server and in client components. Saved orders are lists of keys; anything unknown is dropped and
// any key missing from a saved list (a nav item added later) goes back at its default position.

export const NAV_KEYS = ["today", "inbox", "leads", "pipeline", "customers", "calendar", "tasks", "campaigns", "leadgen"] as const;
export type NavKey = (typeof NAV_KEYS)[number];

export const NAV_HREF: Record<NavKey, string> = {
  today: "/admin/dashboard",
  inbox: "/admin/inbox",
  leads: "/admin/leads",
  pipeline: "/admin/deals",
  customers: "/admin/customers",
  calendar: "/admin/calendar",
  tasks: "/admin/tasks",
  campaigns: "/admin/campaigns",
  leadgen: "/admin/lead-gen",
};

export function isNavKey(k: unknown): k is NavKey {
  return typeof k === "string" && (NAV_KEYS as readonly string[]).includes(k);
}

export function isDefaultOrder(order: readonly NavKey[]): boolean {
  return order.every((k, i) => k === NAV_KEYS[i]);
}

/** A saved value (anything) as a full, valid order. */
export function normalizeOrder(saved: unknown): NavKey[] {
  const kept: NavKey[] = [];
  if (Array.isArray(saved)) for (const k of saved) if (isNavKey(k) && !kept.includes(k)) kept.push(k);
  const out = [...kept];
  NAV_KEYS.forEach((k, i) => {
    if (!out.includes(k)) out.splice(Math.min(i, out.length), 0, k);
  });
  return out;
}

/** Move one key by `delta` places, clamped to the ends. */
export function moveKey(order: readonly NavKey[], key: NavKey, delta: number): NavKey[] {
  const from = order.indexOf(key);
  const to = Math.max(0, Math.min(order.length - 1, from + delta));
  if (from < 0 || from === to) return [...order];
  const next = order.filter((k) => k !== key);
  next.splice(to, 0, key);
  return next;
}
