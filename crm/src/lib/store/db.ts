import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type StoreClient = SupabaseClient<Database>;

// Server actions and pages run inside a logged-in request, so the
// cookie-based client (RLS as `authenticated`) is the right default. Callers
// without a browser session (scripts, tests) pass their own client instead.
export async function getStoreClient(override?: StoreClient): Promise<StoreClient> {
  if (override) return override;
  return createServerSupabaseClient();
}
