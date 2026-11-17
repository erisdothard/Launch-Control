import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { StoreClient } from "@/lib/store/db";

// Who is calling the CRM's AI connection. ChatGPT signs in through Supabase's OAuth server and
// sends the person's own access token, so every query below runs as that person under the same
// database rules as the CRM itself. Only people on the team list get in.

export interface McpCaller {
  email: string;
  client: StoreClient;
}

/** The CRM's own address, never taken from forwarded headers a caller could set. */
export function publicOrigin(req: Request): string {
  const configured = process.env.CRM_PUBLIC_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const production = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : undefined;
  if (production) return `https://${production}`;
  return new URL(req.url).origin;
}

export function resourceMetadataUrl(req: Request): string {
  return `${publicOrigin(req)}/.well-known/oauth-protected-resource`;
}

function bearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
}

export async function authenticate(req: Request): Promise<McpCaller | null> {
  const token = bearer(req);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return null;

  const client = createClient<Database>(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (error || !email) return null;

  const { data: allowed, error: rpcError } = await client.rpc("is_crm_user");
  if (rpcError || allowed !== true) return null;
  return { email, client };
}
