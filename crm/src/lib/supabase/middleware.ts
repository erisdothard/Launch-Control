import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// The update-password page's session comes from a URL fragment
// (#access_token=...) that only the browser can read — on the very first
// request the server sees no session yet, so gating this route here would
// bounce a legitimate password-reset link before the client-side code has a
// chance to establish the session.
const PUBLIC_ADMIN_PATHS = ["/admin/update-password"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicAdminPath = PUBLIC_ADMIN_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user && !isPublicAdminPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Signed in is not enough: anyone can sign up, so only people on the crm_users allowlist get in.
  // The login page signs them out and says why.
  if (user && !isPublicAdminPath) {
    const { data: allowed } = await supabase.rpc("is_crm_user");
    if (allowed !== true) {
      const url = new URL("/login", request.url);
      url.searchParams.set("denied", "1");
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
