"use server";

import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/demo/mode";
import { DEMO_STEPS, LAST_STEP } from "@/lib/demo/script";
import { readDemoState, seedTo } from "@/lib/demo/seed";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { teamTodayISO } from "@/lib/leads/followUp";
import { emailConfig } from "@/lib/email/config";

// The walkthrough's buttons. Each one refuses outside demo mode, so the real CRM can never be
// reset by a stray request, and writes into the demo schema: with the service role when the
// deployment has it, else as the signed-in demo user (demo.crm_users can write every demo table).

export type StepResult = { ok: true; step: number; route: string } | { ok: false; error: string };

async function demoDb() {
  if (!isDemoMode()) throw new Error("Not the demo.");
  return createServiceRoleClient() ?? (await createServerSupabaseClient());
}

/** Put the demo at `step` and say where to look. `company` renames the business (only when given). */
export async function goToStepAction(step: number, company?: string): Promise<StepResult> {
  try {
    const db = await demoDb();
    const current = await readDemoState(db);
    const target = Math.max(0, Math.min(LAST_STEP, Math.floor(step)));
    const seeded = await seedTo(db, target, company ?? current.company);
    revalidatePath("/admin", "layout");
    const tomorrow = teamTodayISO(new Date(Date.now() + 86_400_000), emailConfig.teamTimeZone);
    const template = DEMO_STEPS[seeded.step].route;
    if (template.includes("{lead}") && !seeded.leadId) return { ok: true, step: seeded.step, route: "/admin/dashboard" };
    return { ok: true, step: seeded.step, route: template.replace("{lead}", seeded.leadId ?? "").replace("{tomorrow}", tomorrow) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
