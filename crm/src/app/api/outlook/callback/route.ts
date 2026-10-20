import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeOutlookCode, outlookIdentity } from "@/lib/email/outlook";
import { currentCrmUserEmail } from "@/lib/email/session";
import { createServiceRoleClient } from "@/lib/supabase/server";

const STATE_COOKIE = "outlook_oauth_state";

function settings(request: NextRequest, result: string) {
  const response = NextResponse.redirect(new URL(`/admin/settings?outlook=${result}`, request.url));
  response.cookies.delete({ name: STATE_COOKIE, path: "/api/outlook" });
  return response;
}

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Microsoft sends the user back here with ?code&state. Saves the mailbox, its aliases and the
// refresh token (in Vault).
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
    const redirectUri = new URL("/api/outlook/callback", request.url).toString();
    const tokens = await exchangeOutlookCode(params.get("code") ?? "", redirectUri);
    if (!tokens.refresh_token) return settings(request, "no-refresh-token");
    const who = await outlookIdentity(tokens.access_token);
    const { error } = await admin.rpc("save_outlook_account", {
      p_mailbox: who.mailbox,
      p_aliases: who.aliases,
      p_display_name: "",
      p_connected_by: userEmail,
      p_refresh_token: tokens.refresh_token,
    });
    if (error) return settings(request, "save-failed");
  } catch {
    return settings(request, "failed");
  }
  return settings(request, "connected");
}
