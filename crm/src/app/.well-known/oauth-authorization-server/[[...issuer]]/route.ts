import { NextResponse } from "next/server";

// Some MCP clients look for sign-in details on the CRM's own address instead of following the
// protected-resource pointer. Hand them Supabase's OAuth server metadata for this project.
export async function GET() {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!supabase) return NextResponse.json({ error: "not configured" }, { status: 500 });
  const res = await fetch(`${supabase}/.well-known/oauth-authorization-server/auth/v1`, { next: { revalidate: 300 } });
  if (!res.ok) return NextResponse.json({ error: "sign-in server unavailable" }, { status: 502 });
  return NextResponse.json(await res.json(), { headers: { "Cache-Control": "public, max-age=300" } });
}
