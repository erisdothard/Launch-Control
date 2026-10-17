/**
 * Simplified from the Hyper Racer CRM, which split owner/editor access
 * across CRM pages vs. website-content pages. This shell only has the CRM
 * kernel (no content-management verticals), so there's nothing to split —
 * any signed-in user is treated as a full user. Reintroduce a role split
 * here if a client build adds content-management pages that need gating.
 */

export type Role = "owner";

export function roleFromUser(
  user: { app_metadata?: { [key: string]: unknown } | null } | null | undefined
): Role {
  void user;
  return "owner";
}
