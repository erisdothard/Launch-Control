import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { outlookAppOnly, outlookEnabled } from "./config";
import { appOnlyToken, OutlookReconnectNeeded, refreshOutlook, type TokenResource } from "./outlook";

export interface OutlookAccountRef {
  id: string;
  address: string;
  mailbox: string; // the signed-in mailbox (== address unless this row is an alias)
}

/** The connected mailbox row (not an alias), or null when Outlook isn't connected. */
export async function primaryOutlookAccount(): Promise<OutlookAccountRef | null> {
  if (!outlookEnabled()) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data } = await admin
    .from("email_accounts")
    .select("id, address")
    .eq("provider", "outlook")
    .eq("status", "active")
    .is("mailbox", null)
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, address: data.address, mailbox: data.address } : null;
}

/**
 * A fresh Graph access token for an Outlook account (mailbox or alias row). Saves the rotated
 * refresh token, and flags every row on the mailbox for reconnecting if Microsoft revoked it.
 */
export async function outlookAccessToken(accountId: string, resource: TokenResource = "graph"): Promise<string> {
  // App-only: one token for the app, whatever row is sending. Nothing to refresh, nothing to revoke.
  if (outlookAppOnly()) return appOnlyToken(resource);
  const admin = createServiceRoleClient();
  if (!admin) throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY");
  const { data: refreshToken } = await admin.rpc("mail_refresh_token", { p_account_id: accountId });
  if (!refreshToken) throw new OutlookReconnectNeeded();
  try {
    const tokens = await refreshOutlook(refreshToken, resource);
    if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
      await admin.rpc("save_mail_refresh_token", { p_account_id: accountId, p_refresh_token: tokens.refresh_token });
    }
    return tokens.access_token;
  } catch (err) {
    if (err instanceof OutlookReconnectNeeded) {
      const { data: row } = await admin.from("email_accounts").select("token_secret_id").eq("id", accountId).maybeSingle();
      if (row?.token_secret_id) {
        await admin
          .from("email_accounts")
          .update({ status: "needs_reconnect", last_error: err.reason || err.message, last_error_at: new Date().toISOString() })
          .eq("token_secret_id", row.token_secret_id);
      }
    }
    throw err;
  }
}
