import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, gmailProfile } from "@/lib/email/gmail";
import { currentCrmUserEmail } from "@/lib/email/session";
import { createServiceRoleClient } from "@/lib/supabase/server";

const STATE_COOKIE = "gmail_oauth_state";

function settings(request: NextRequest, result: string) {
  const response = NextResponse.redirect(new URL(`/admin/settings?gmail=${result}`, request.url));
  response.cookies.delete({ name: STATE_COOKIE, path: "/api/gmail" });
  return response;
}

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Google sends the user back here with ?code&state. Stores the refresh token in Vault.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = params.get("state") ?? "";
  const expected = request.cookies.get(STATE_COOKIE)?.value ?? "";
  if (params.get("error")) return settings(request, "cancelled");
  if (!state || !expected || !sameState(state, expected)) return settings(request, "bad-state");

  const userEmail = await currentCrmUserEmail();
  if (!userEmail) return NextResponse.redirect(new URL("/login", request.url));
  const admin = createServiceRoleClient();
  if (!admin) return settings(request, "not-configured");

  try {
    const redirectUri = new URL("/api/gmail/callback", request.url).toString();
    const tokens = await exchangeCode(params.get("code") ?? "", redirectUri);
    if (!tokens.refresh_token) return settings(request, "no-refresh-token");
    const profile = await gmailProfile(tokens.access_token);
    const { data: accountId, error } = await admin.rpc("save_gmail_account", {
      p_address: profile.emailAddress,
      p_display_name: "",
      p_connected_by: userEmail,
      p_refresh_token: tokens.refresh_token,
    });
    if (error || !accountId) return settings(request, "save-failed");
    await admin.from("email_accounts").update({ gmail_history_id: profile.historyId }).eq("id", accountId);
  } catch {
    return settings(request, "failed");
  }
  return settings(request, "connected");
}
