import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/mcp/auth";

// Tells ChatGPT (or any MCP client) where to sign in for the CRM's AI connection: Supabase's OAuth
// server for this project. Served at the root and at /api/mcp under it, as clients ask either.
export function GET(req: Request) {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!supabase) return NextResponse.json({ error: "not configured" }, { status: 500 });
  const origin = publicOrigin(req);
  return NextResponse.json(
    {
      resource: `${origin}/api/mcp`,
      authorization_servers: [`${supabase}/auth/v1`],
      bearer_methods_supported: ["header"],
      resource_name: "Launch Control CRM",
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
