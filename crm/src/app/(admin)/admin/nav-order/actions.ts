"use server";

import { currentCrmUserEmail } from "@/lib/email/session";
import { isNavKey, NAV_KEYS, normalizeOrder, type NavKey } from "@/lib/nav/order";
import { getNavOrder, navOrderDbEnabled, setNavOrder } from "@/lib/store/navOrder";

// Read and write the signed-in user's nav order. Both are no-ops (disabled) until NAV_ORDER_DB=1;
// the sidebar keeps its own copy in localStorage either way.

export async function getNavOrderAction(): Promise<NavKey[] | null> {
  if (!navOrderDbEnabled()) return null;
  return getNavOrder(await currentCrmUserEmail());
}

/** `order: null` resets to the default. */
export async function saveNavOrderAction(order: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!navOrderDbEnabled()) return { ok: false, error: "disabled" };
  const email = await currentCrmUserEmail();
  if (!email) return { ok: false, error: "Sign in again." };
  if (order === null) return setNavOrder(email, null);
  if (!Array.isArray(order) || order.length > NAV_KEYS.length || !order.every(isNavKey)) return { ok: false, error: "That menu order isn't valid." };
  return setNavOrder(email, normalizeOrder(order));
}
