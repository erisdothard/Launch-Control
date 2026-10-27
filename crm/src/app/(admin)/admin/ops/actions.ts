"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/auth/owner";
import { HALT_KEY } from "@/lib/agents/halt";

/**
 * Clears the Guardian's outbound halt. A person's job, never an agent's (docs/agents/CONVENTIONS.md),
 * and owner-only: the check runs here, on the server, not just by hiding the button.
 */
export async function clearHalt(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isOwner(user.email)) redirect("/admin/ops?halt=denied");

  // system_flags isn't in the generated Database type yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as SupabaseClient<any, any, any>;
  const { data, error } = await db
    .from("system_flags")
    .update({ value: false, updated_at: new Date().toISOString(), updated_by: user.email })
    .eq("key", HALT_KEY)
    .select("key");
  revalidatePath("/admin/ops");
  redirect(error || !data?.length ? "/admin/ops?halt=error" : "/admin/ops?halt=cleared");
}
