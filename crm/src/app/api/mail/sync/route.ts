import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { syncOutlookIfDue } from "@/lib/email/outlookSync";

// Vercel's daily cron (vercel.json) calls this with the CRON_SECRET, so mail still arrives on a
// day nobody opens the CRM. Page loads do the same work every 90 seconds while someone is in it.

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const seen = await syncOutlookIfDue();
  return NextResponse.json({ ok: true, ran: seen !== null });
}
