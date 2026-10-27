import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoMode } from "@/lib/demo/mode";

// The Guardian's stop switch: system_flags.outbound_halt (migration 20261026000001). While it is
// anything but `false`, nothing is sent: sendEmail and both automation send routes ask here first.
// Fails CLOSED: a flag that can't be read, a missing row or a non-boolean value all mean halted.
// The Python twin is tools/leadgen/leadgen/agent_log.py outbound_halted(); the worker checks there.
//
// The demo deployment is the exception: it reads the `demo` schema, which has no system_flags,
// and its sends never leave the database, so there is nothing to halt.

export const HALT_KEY = "outbound_halt";
export const HALT_MESSAGE = "Outbound is halted by Guardian. Clear it in Ops.";
export const HALT_UNKNOWN_MESSAGE = "Couldn't confirm outbound is clear to send, so nothing was sent. Check Ops, then try again.";

export type HaltState = { halted: false } | { halted: true; known: boolean; message: string };

// system_flags isn't in the generated Database type yet; this keeps the cast in one place.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export async function outboundHalt(client: unknown): Promise<HaltState> {
  if (isDemoMode()) return { halted: false };
  try {
    const { data, error } = await (client as AnyClient).from("system_flags").select("value").eq("key", HALT_KEY).maybeSingle();
    if (error || !data) return { halted: true, known: false, message: HALT_UNKNOWN_MESSAGE };
    return data.value === false ? { halted: false } : { halted: true, known: true, message: HALT_MESSAGE };
  } catch {
    return { halted: true, known: false, message: HALT_UNKNOWN_MESSAGE };
  }
}
