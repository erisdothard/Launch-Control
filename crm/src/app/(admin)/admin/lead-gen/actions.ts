"use server";

import { revalidatePath } from "next/cache";
import { markLeadNotAFit } from "@/lib/store/leads";
import { cancelRun, queueRun } from "@/lib/store/leadgen";
import { LEADGEN_REQUIRE, LEADGEN_SEGMENTS, LEADGEN_SIZES, LEADGEN_STATES, type LeadGenRequireKey } from "@/lib/leadgen/catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function markProspectNotAFitAction(id: string) {
  await markLeadNotAFit(id);
  revalidatePath("/admin/lead-gen");
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${id}`);
  revalidatePath("/admin/activity");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/today");
}

export interface FindLeadsInput {
  states: string[];
  segments: string[];
  size: string;
  require: string[];
}

export type FindLeadsResult = { ok: true } | { ok: false; error: string };

const STATE_SET = new Set<string>(LEADGEN_STATES);
const SEGMENT_SET = new Set<string>(LEADGEN_SEGMENTS.map((s) => s.key));
const REQUIRE_SET = new Set<string>(LEADGEN_REQUIRE.map((r) => r.key));

// Queue a search for the Railway worker. Empty states/segments mean "all of them".
export async function findLeadsAction(input: FindLeadsInput): Promise<FindLeadsResult> {
  const size = LEADGEN_SIZES.find((s) => s.key === input.size);
  if (!size) return { ok: false, error: "Pick a run size." };
  const states = (Array.isArray(input.states) ? input.states : []).filter((s) => STATE_SET.has(s));
  const segments = (Array.isArray(input.segments) ? input.segments : []).filter((s) => SEGMENT_SET.has(s));
  const require = (Array.isArray(input.require) ? input.require : []).filter((r): r is LeadGenRequireKey =>
    REQUIRE_SET.has(r),
  );

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Sign in again to start a search." };

  try {
    await queueRun(
      {
        size: size.key,
        max_queries: size.maxQueries,
        ...(states.length ? { states } : {}),
        ...(segments.length ? { segments } : {}),
        ...(require.length ? { require } : {}),
      },
      user.email,
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not start the search." };
  }
  revalidatePath("/admin/lead-gen");
  return { ok: true };
}

export async function cancelLeadsRunAction(id: string): Promise<void> {
  await cancelRun(id);
  revalidatePath("/admin/lead-gen");
}
