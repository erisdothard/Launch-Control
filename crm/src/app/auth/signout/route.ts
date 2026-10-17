import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// The admin sidebar and mobile nav post here to sign out. Clears the
// Supabase session cookies and sends the user back to login.
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), {
    status: 303, // turn the POST into a GET on the redirect
  });
}
