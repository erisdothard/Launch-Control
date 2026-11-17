import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// One-click sign-in links (Supabase's token-hash pattern): /auth/confirm?token_hash=...&type=magiclink.
// Verifies the single-use token, sets the session cookies, then goes to `next` (CRM paths only).
// The /admin guard still checks the user is on the CRM allowlist after this.
const TYPES: EmailOtpType[] = ["magiclink", "email", "recovery", "invite"];

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextParam = url.searchParams.get("next") ?? "/admin/dashboard";
  const next = nextParam.startsWith("/admin") ? nextParam : "/admin/dashboard";

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL("/login?error=link", request.url));
}
