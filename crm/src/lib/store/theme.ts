import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDefaultTheme, normalizeTheme, parseTheme, type Theme } from "@/lib/theme/theme";

// Each person's colours, in crm_users.theme (migration 20261118000001_max_revisions.sql). Null, a
// missing column or anything malformed all mean the default look, so this can never break a page.

export async function getTheme(email: string | null | undefined): Promise<Theme | null> {
  if (!email) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin.from("crm_users").select("theme").eq("email", email.toLowerCase()).maybeSingle();
  if (error || !data) return null;
  const theme = parseTheme(data.theme);
  return theme ? normalizeTheme(theme) : null;
}

/** Saves the colours, or clears them (null, or the default pair) so the designed look returns. */
export async function setTheme(email: string, theme: Theme | null): Promise<{ ok: boolean }> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false };
  const clean = theme ? normalizeTheme(theme) : null;
  const value = clean && !isDefaultTheme(clean) ? { background: clean.background, accent: clean.accent } : null;
  const { error } = await admin.from("crm_users").update({ theme: value }).eq("email", email.toLowerCase());
  return { ok: !error };
}
