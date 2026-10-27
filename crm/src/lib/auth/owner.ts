// Pages only Eris sees (agent ops, internal tooling). Everyone else gets a 404, and the nav
// item never renders for them. The demo deployment never shows these at all.

import { isDemoMode } from "@/lib/demo/mode";

export const OWNER_EMAIL = "eris@golaunchcontrol.com";

export function isOwner(email: string | null | undefined): boolean {
  if (isDemoMode() || !email) return false;
  return email.trim().toLowerCase() === OWNER_EMAIL;
}
