import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import type { Lead } from "./types";

// Businesses the team deleted from the CRM. Deleting erases the lead row, and with it the only
// thing that told lead gen "we already have this one", so the next run would find the business
// again. The list lives in system_flags.blocked_companies ({ companies: [...] }); lead gen reads it
// before it keeps a scraped business or drafts a first email (tools/leadgen/leadgen/store.py
// blocked_companies, dedupe.company_keys). Deleting still removes the lead's own emails with it
// (email_messages cascades); to keep the conversation, close the lead as not a fit instead.
export const BLOCKED_KEY = "blocked_companies";

export interface BlockedCompany {
  business_name: string;
  website: string | null;
  domain: string | null;
  email: string;
  phone: string;
  city: string | null;
  blocked_at: string;
}

export function blockedEntry(lead: Lead, now: Date): BlockedCompany {
  return {
    business_name: lead.businessName,
    website: lead.prospect?.website ?? null,
    domain: lead.prospect?.domain ?? null,
    email: lead.email,
    phone: lead.phone,
    city: lead.prospect?.city ?? null,
    blocked_at: now.toISOString(),
  };
}

/**
 * Remember a business as blocked. Uses the service role: the team can read system_flags but not
 * write it. Throws when the list can't be saved, so a delete never goes through unremembered. The
 * demo schema has no system_flags, and a build without the service key (local) has nowhere to
 * write, so both skip.
 */
export async function blockCompany(lead: Lead, by: string): Promise<void> {
  if (isDemoMode()) return;
  const admin = createServiceRoleClient();
  if (!admin) return;
  // system_flags isn't in the generated Database type yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as unknown as SupabaseClient<any, any, any>;
  const { data, error } = await db.from("system_flags").select("value").eq("key", BLOCKED_KEY).maybeSingle();
  if (error) throw error;
  const saved = (data?.value as { companies?: unknown } | null)?.companies;
  const companies = [...(Array.isArray(saved) ? saved : []), blockedEntry(lead, new Date())];
  const { error: writeError } = await db
    .from("system_flags")
    .upsert({ key: BLOCKED_KEY, value: { companies }, updated_at: new Date().toISOString(), updated_by: by }, { onConflict: "key" });
  if (writeError) throw writeError;
}
