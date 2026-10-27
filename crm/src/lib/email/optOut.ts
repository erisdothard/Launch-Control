import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Opted out means opted out, on every route that sends: a single email, a reply, a drafted
// follow-up, the automatic follow-up sender, a campaign's first email and its follow-up. sendEmail
// calls this before anything reaches a mail provider, so no caller can forget it.
// An address is blocked when it unsubscribed or bounced (email_suppressions), or when any lead
// with that address, or the lead the email is on, asked not to be contacted.

type Admin = SupabaseClient<Database>;

export interface OptOutBlock {
  email: string;
  reason: string;
}

const REASON = {
  opt_out: "unsubscribed",
  bounce: "bounced before",
  dnc: "asked not to be contacted",
} as const;

/** LIKE treats _ and % as wildcards; addresses are matched literally (case-insensitive). */
function literal(email: string): string {
  return email.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * The first recipient who must not be emailed, with why; null when everyone may be. Throws when
 * it can't tell (the database didn't answer), so callers refuse to send rather than guess.
 */
export async function findOptOut(admin: Admin, recipients: string[], leadId: string | null): Promise<OptOutBlock | null> {
  const emails = [...new Set(recipients.map((r) => r.trim().toLowerCase()).filter(Boolean))];
  if (leadId) {
    const { data, error } = await admin.from("leads").select("email, do_not_contact").eq("id", leadId).maybeSingle();
    if (error) throw error;
    if (data?.do_not_contact) return { email: emails[0] ?? data.email, reason: REASON.dnc };
  }
  if (emails.length === 0) return null;

  const { data: suppressed, error: suppressError } = await admin.from("email_suppressions").select("email, reason").in("email", emails);
  if (suppressError) throw suppressError;
  const hit = suppressed?.[0];
  if (hit) return { email: hit.email, reason: hit.reason === "bounce" ? REASON.bounce : REASON.opt_out };

  const anyOf = emails.map((e) => `email.ilike.${JSON.stringify(literal(e))}`).join(",");
  const { data: dnc, error: dncError } = await admin.from("leads").select("email").eq("do_not_contact", true).or(anyOf).limit(1);
  if (dncError) throw dncError;
  if (dnc?.[0]) return { email: dnc[0].email.toLowerCase(), reason: REASON.dnc };
  return null;
}

export function optOutMessage(block: OptOutBlock): string {
  return `Not sent: ${block.email} ${block.reason}. The CRM never emails them again.`;
}
