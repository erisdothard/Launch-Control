import "server-only";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

/** The signed-in user's email when they are on the CRM allowlist, else null. */
export async function currentCrmUserEmail(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data } = await admin.from("crm_users").select("email").eq("email", email).maybeSingle();
  return data ? email : null;
}
