import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeOrder, type NavKey } from "@/lib/nav/order";

// Per-user nav order in crm_users.nav_order (migration 20261029000001_crm_users_nav_order.sql).
// Gated: until NAV_ORDER_DB=1 is set (after that migration is applied), nothing here touches the
// database and the browser's localStorage is the only copy.

export function navOrderDbEnabled(): boolean {
  return process.env.NAV_ORDER_DB === "1";
}

/** The saved order, or null when there is none, the gate is off, or the column isn't there yet. */
export async function getNavOrder(email: string | null | undefined): Promise<NavKey[] | null> {
  if (!navOrderDbEnabled() || !email) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  // nav_order isn't in the generated types until the migration is applied.
  const { data, error } = await admin.from("crm_users").select("*").eq("email", email.toLowerCase()).maybeSingle();
  if (error || !data) return null;
  const saved = (data as Record<string, unknown>).nav_order;
  return Array.isArray(saved) ? normalizeOrder(saved) : null;
}

export async function setNavOrder(email: string, order: NavKey[] | null): Promise<{ ok: boolean; error?: string }> {
  if (!navOrderDbEnabled()) return { ok: false, error: "disabled" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "No database connection." };
  const { error } = await admin
    .from("crm_users")
    .update({ nav_order: order } as never)
    .eq("email", email.toLowerCase());
  return error ? { ok: false, error: "Couldn't save the menu order." } : { ok: true };
}
