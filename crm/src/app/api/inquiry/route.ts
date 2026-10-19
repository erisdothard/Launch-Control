import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/leads/followUp";
import { WEBSITE_LEAD_SOURCE } from "@/lib/store/types";

// The marketing site's booking form (web/src/app/actions/book.ts) posts here server-to-server with
// a shared secret. A new address becomes a lead due for follow-up today; a known address gets the
// inquiry appended to its notes instead, so nobody ends up with two records.

const MAX_BODY_BYTES = 16_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authorized(request: NextRequest): boolean {
  const secret = process.env.INQUIRY_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const name = text(body.name, 120);
  const email = text(body.email, 254).toLowerCase();
  const launching = text(body.launching, 2000);
  const budget = text(body.budget, 60);
  if (!name || !EMAIL.test(email)) return NextResponse.json({ error: "name and email required" }, { status: 400 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "not configured" }, { status: 500 });

  const today = todayISO();
  const note = [`Website inquiry ${today}`, launching && `Launching: ${launching}`, budget && `Budget: ${budget}`]
    .filter(Boolean)
    .join("\n");

  const { data: existing, error: findError } = await admin
    .from("leads")
    .select("id, business_name, notes")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (findError) return NextResponse.json({ error: "lookup failed" }, { status: 500 });

  if (existing) {
    const { error } = await admin
      .from("leads")
      .update({
        notes: existing.notes ? `${existing.notes}\n\n${note}` : note,
        follow_up_on: today,
        next_action: "Reply to website inquiry",
      })
      .eq("id", existing.id);
    if (error) return NextResponse.json({ error: "update failed" }, { status: 500 });
    await admin.from("activity_log").insert({
      entity_type: "lead",
      entity_id: existing.id,
      entity_label: existing.business_name,
      action: "updated",
      detail: "new website inquiry",
    });
    return NextResponse.json({ ok: true, lead: existing.id, existing: true });
  }

  const { data: lead, error } = await admin
    .from("leads")
    .insert({
      business_name: name,
      contact_name: name,
      email,
      source: WEBSITE_LEAD_SOURCE,
      notes: note,
      status: "new",
      follow_up_on: today,
      next_action: "Reply to website inquiry",
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "insert failed" }, { status: 500 });
  await admin.from("activity_log").insert({
    entity_type: "lead",
    entity_id: lead.id,
    entity_label: name,
    action: "created",
    detail: "from the website",
  });
  return NextResponse.json({ ok: true, lead: lead.id });
}
