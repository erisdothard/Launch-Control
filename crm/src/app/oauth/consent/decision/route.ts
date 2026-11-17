import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/mcp/auth";
import { isTrustedRedirect } from "@/lib/mcp/trustedApps";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Allow or Cancel on the connect screen. Same-site form posts only; Supabase checks that the signed-in
// person owns the request, then hands back the AI app's address to return to.
export async function POST(req: Request) {
  const origin = publicOrigin(req);
  // Fail closed: the post must say it came from this site.
  const from = req.headers.get("origin");
  const sameSite = from ? from === origin || from === new URL(req.url).origin : req.headers.get("sec-fetch-site") === "same-origin";
  if (!sameSite) return new Response("Forbidden", { status: 403 });

  const form = await req.formData();
  const authorizationId = String(form.get("authorization_id") ?? "");
  const decision = form.get("decision");
  if (!/^[\w-]{1,128}$/.test(authorizationId) || (decision !== "approve" && decision !== "deny")) {
    return new Response("Bad request", { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const back = `${origin}/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
  if (!user) return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`, 303);
  const { data: allowed } = await supabase.rpc("is_crm_user");
  if (allowed !== true) return NextResponse.redirect(`${origin}/login?denied=1`, 303);

  if (decision === "approve") {
    const { data: details } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (!details || !("authorization_id" in details) || !isTrustedRedirect(details.redirect_uri)) {
      return NextResponse.redirect(back, 303);
    }
  }
  const opts = { skipBrowserRedirect: true };
  const { data, error } =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, opts)
      : await supabase.auth.oauth.denyAuthorization(authorizationId, opts);
  if (error || !data?.redirect_url) {
    console.error("oauth consent failed", decision, error?.message);
    return NextResponse.redirect(`${back}&error=1`, 303);
  }
  return NextResponse.redirect(data.redirect_url, 303);
}
