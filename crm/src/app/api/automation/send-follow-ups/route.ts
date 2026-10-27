import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendAsAccount, type SendResult } from "@/lib/email/send";
import { primaryOutlookAccount } from "@/lib/email/outlookAccount";
import { emailConfig } from "@/lib/email/config";
import { claimDraft, markDraft } from "@/lib/store/drafts";
import { outboundHalt } from "@/lib/agents/halt";

// Sends the follow-up drafts the worker wrote (tools/leadgen/leadgen/automation.py), when the team
// has switched automatic sending on in Settings. The worker calls this every pass with
// AUTOMATION_SECRET; nothing else can reach it. Replies are never sent from here: a person sends those.
const SENT_BY = "automation";
const TEAM_TZ = emailConfig.teamTimeZone;

function authorized(request: NextRequest): boolean {
  const secret = process.env.AUTOMATION_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Midnight at the start of the team's day, as a UTC instant, for the daily cap. */
function startOfTeamDay(now = new Date()): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: TEAM_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const noonUtc = new Date(`${day}T12:00:00Z`);
  const noonLocal = new Date(noonUtc.toLocaleString("en-US", { timeZone: TEAM_TZ }));
  const offsetMs = noonUtc.getTime() - noonLocal.getTime();
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + offsetMs).toISOString();
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "not configured" }, { status: 500 });
  // The Guardian's halt: refuse the whole pass (423) so the worker logs it. Fails closed.
  const halt = await outboundHalt(admin);
  if (halt.halted) return NextResponse.json({ sent: 0, halted: true, error: halt.message }, { status: 423 });

  const { data: settings } = await admin.from("automation_settings").select("auto_send_follow_ups, daily_send_cap").eq("id", true).maybeSingle();
  if (!settings?.auto_send_follow_ups) return NextResponse.json({ sent: 0, skipped: "automatic sending is off" });

  const { count: sentToday } = await admin
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .eq("sent_by", SENT_BY)
    .eq("status", "sent")
    .gte("created_at", startOfTeamDay());
  const room = Math.max(0, settings.daily_send_cap - (sentToday ?? 0));
  if (room === 0) return NextResponse.json({ sent: 0, skipped: "daily limit reached" });

  const { data: drafts, error } = await admin
    .from("email_drafts")
    .select("id, lead_id, to_address, subject, body_text, leads(awaiting, do_not_contact, status)")
    .eq("status", "pending")
    .eq("kind", "follow_up")
    .order("created_at", { ascending: true })
    .limit(room);
  if (error) return NextResponse.json({ error: "could not read drafts" }, { status: 500 });

  const primary = await primaryOutlookAccount();
  let sent = 0;
  const failed: { id: string; error: string }[] = [];
  const warnings: { id: string; warning: string }[] = [];
  for (const d of drafts ?? []) {
    const lead = (d as unknown as { leads: { awaiting: string | null; do_not_contact: boolean; status: string } | null }).leads;
    // Re-check at send time: they may have replied or opted out since the draft was written.
    if (!lead || lead.do_not_contact || lead.awaiting !== "them" || lead.status === "converted" || lead.status === "lost" || lead.status === "nurture") {
      await admin.from("email_drafts").update({ status: "discarded", updated_at: new Date().toISOString() }).eq("id", d.id).eq("status", "pending");
      continue;
    }
    // Stay on the mailbox the thread is on; otherwise Max's Outlook.
    const { data: lastOut } = await admin
      .from("email_messages")
      .select("account_id, email_accounts(status)")
      .eq("lead_id", d.lead_id)
      .eq("direction", "out")
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const threadAccount = lastOut as unknown as { account_id: string | null; email_accounts: { status: string } | null } | null;
    const accountId =
      threadAccount?.account_id && threadAccount.email_accounts?.status === "active" ? threadAccount.account_id : primary?.id;
    if (!accountId) {
      failed.push({ id: d.id, error: "No active sending account." });
      continue;
    }
    // The same claim the Inbox and Today use: if Max is sending this draft right now, skip it.
    if (!(await claimDraft(d.id, SENT_BY, admin))) continue;
    const result = await sendAsAccount({
      leadId: d.lead_id,
      accountId,
      to: d.to_address,
      subject: d.subject,
      body: d.body_text,
      sentBy: SENT_BY,
    }).catch((err: unknown): SendResult => ({ ok: false, error: err instanceof Error ? err.message : "Send failed" }));
    if (result.ok) {
      // Claimed as sent already. A warning means it went out but the CRM copy didn't save.
      sent += 1;
      if (result.warning) warnings.push({ id: d.id, warning: result.warning });
    } else if (result.code === "opted_out") {
      // They can never be emailed: the draft is dropped, not retried every pass.
      await markDraft(d.id, { status: "discarded", error: result.error }, admin);
    } else {
      failed.push({ id: d.id, error: result.error });
      // Back in the queue with the reason, for a person or the next pass.
      await markDraft(d.id, { status: "pending", error: result.error }, admin);
      // Halted mid-pass: stop here; the rest wait until a person clears it.
      if (result.code === "halted") break;
    }
  }
  return NextResponse.json({ sent, failed: failed.length, warnings: warnings.length });
}
