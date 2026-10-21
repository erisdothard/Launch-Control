import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isDemoMode } from "@/lib/demo/mode";
import { seedTo } from "@/lib/demo/seed";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Vercel's daily cron (vercel.json) calls this with the CRON_SECRET so the demo starts every
// morning empty, ready for "Start the demo". Outside demo mode it does not exist.

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  if (!isDemoMode()) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createServiceRoleClient();
  if (!db) return NextResponse.json({ error: "missing service key" }, { status: 500 });
  try {
    const step = Number(request.nextUrl.searchParams.get("step") ?? 0);
    const seeded = await seedTo(db, Number.isFinite(step) ? step : 0);
    return NextResponse.json({ ok: true, step: seeded.step });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "reset failed" }, { status: 500 });
  }
}
