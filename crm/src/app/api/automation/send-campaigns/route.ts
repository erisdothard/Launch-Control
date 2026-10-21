import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { renderMerge } from "@/lib/email/merge";
import { replySubject } from "@/lib/email/text";
import { toAttachments, toMerge } from "@/lib/store/campaigns";
import type { Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// The mass email engine. The worker (tools/leadgen/leadgen/campaigns.py) calls this once a minute
// with AUTOMATION_SECRET. Each call:
//   1. marks recipients who replied (an inbound email from their address after we wrote), and
//      suppresses the address for good when the reply is an opt-out;
//   2. sends up to each campaign's per-minute pace of pending first emails, one email per person;
//   3. sends due automatic follow-ups to people who haven't replied;
//   4. marks a campaign sent when nobody is left pending.
// Every send re-checks suppressions and do-not-contact right before it goes.
export const maxDuration = 60;

const SENT_BY = "campaign";
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** Microsoft 365 throttles mailboxes that burst; never more than this per mailbox per minute. */
const ACCOUNT_PER_MINUTE = 30;
/** Stop starting new sends after this long so the call ends inside its time limit. */
const TIME_BUDGET_MS = 45_000;
/** A claimed send with no result after this long was interrupted; don't risk sending it twice. */
const STUCK_MS = 10 * MINUTE_MS;
const REPLY_WINDOW_DAYS = 90;

type Admin = SupabaseClient<Database>;

interface CampaignRow {
  id: string;
  status: string;
  account_id: string | null;
  subject: string;
  body_text: string;
  attachments: Database["public"]["Tables"]["email_campaigns"]["Row"]["attachments"];
  scheduled_at: string | null;
  started_at: string | null;
  per_minute: number;
  follow_up_after_days: number | null;
  follow_up_subject: string | null;
  follow_up_body: string | null;
  include_signature: boolean;
  created_at: string;
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.AUTOMATION_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** A send error that means the address will never work: stop mailing it. */
function isHardBounce(error: string): boolean {
  return /\b55[0-3]\b|5\.1\.[0-9]|user unknown|no such user|does not exist|mailbox unavailable|recipient rejected|address rejected/i.test(error);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Spread a minute's sends out rather than bursting them: 10 a minute goes about every 4 seconds. */
function gapFor(perMinute: number): number {
  return Math.min(5_000, Math.max(1_000, Math.floor(40_000 / Math.max(1, perMinute))));
}

async function blocked(admin: Admin, email: string, leadId: string | null): Promise<string | null> {
  const [{ data: suppressed }, lead] = await Promise.all([
    admin.from("email_suppressions").select("reason").eq("email", email.toLowerCase()).maybeSingle(),
    leadId ? admin.from("leads").select("do_not_contact").eq("id", leadId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (suppressed) return suppressed.reason === "bounce" ? "Address bounced before" : "Unsubscribed";
  if (lead.data?.do_not_contact) return "Asked not to be contacted";
  return null;
}

async function suppress(admin: Admin, email: string, reason: "opt_out" | "bounce"): Promise<void> {
  await admin.from("email_suppressions").upsert({ email: email.toLowerCase(), reason }, { onConflict: "email", ignoreDuplicates: true });
}

/** Step 1: who replied. Returns how many recipients were newly marked. */
async function markReplies(admin: Admin, now: number): Promise<{ replied: number; optedOut: number }> {
  const since = new Date(now - REPLY_WINDOW_DAYS * DAY_MS).toISOString();
  const { data: waiting } = await admin
    .from("campaign_recipients")
    .select("id, email, sent_at")
    .eq("status", "sent")
    .is("replied_at", null)
    .gte("sent_at", since)
    .limit(5000);
  if (!waiting?.length) return { replied: 0, optedOut: 0 };

  const earliest = waiting.reduce((min, r) => (r.sent_at && r.sent_at < min ? r.sent_at : min), new Date(now).toISOString());
  const addresses = [...new Set(waiting.map((r) => r.email.toLowerCase()))];
  const inbound: { from_address: string; created_at: string; body_text: string }[] = [];
  for (let i = 0; i < addresses.length; i += 100) {
    const { data } = await admin
      .from("email_messages")
      .select("from_address, created_at, body_text")
      .eq("direction", "in")
      .in("from_address", addresses.slice(i, i + 100))
      .gte("created_at", earliest)
      .order("created_at", { ascending: true });
    inbound.push(...(data ?? []));
  }

  let replied = 0;
  let optedOut = 0;
  for (const r of waiting) {
    const reply = inbound.find((m) => m.from_address.toLowerCase() === r.email.toLowerCase() && r.sent_at && m.created_at > r.sent_at);
    if (!reply) continue;
    await admin.from("campaign_recipients").update({ replied_at: reply.created_at }).eq("id", r.id).is("replied_at", null);
    replied += 1;
    const { data: isOptOut } = await admin.rpc("is_opt_out", { body: reply.body_text });
    if (isOptOut) {
      await suppress(admin, r.email, "opt_out");
      optedOut += 1;
    }
  }
  return { replied, optedOut };
}

/** Claims a pending first email so two overlapping calls can never both send it. */
async function claimFirst(admin: Admin, id: string, at: string): Promise<boolean> {
  const { data } = await admin
    .from("campaign_recipients")
    .update({ sent_at: at })
    .eq("id", id)
    .eq("status", "pending")
    .is("sent_at", null)
    .select("id");
  return Boolean(data?.length);
}

async function claimFollowUp(admin: Admin, id: string, at: string): Promise<boolean> {
  const { data } = await admin
    .from("campaign_recipients")
    .update({ follow_up_sent_at: at, step: 2 })
    .eq("id", id)
    .eq("step", 1)
    .is("follow_up_sent_at", null)
    .is("replied_at", null)
    .select("id");
  return Boolean(data?.length);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "not configured" }, { status: 500 });

  const started = Date.now();
  const nowIso = () => new Date().toISOString();
  const out = { sent: 0, failed: 0, skipped: 0, followUps: 0, replied: 0, optedOut: 0, finished: 0 };

  // A claim with no result (the function was killed mid-send) is marked failed, never resent:
  // a duplicate email is worse than a missing one, and the error tells Max to check Sent Items.
  await admin
    .from("campaign_recipients")
    .update({ status: "failed", error: "Interrupted while sending. Check Sent Items before sending to them again." })
    .eq("status", "pending")
    .not("sent_at", "is", null)
    .lt("sent_at", new Date(started - STUCK_MS).toISOString());

  try {
    const r = await markReplies(admin, started);
    out.replied = r.replied;
    out.optedOut = r.optedOut;
  } catch {
    // Reply tracking failing must not stop sending; the next call tries again.
  }

  const { data: campaignRows, error } = await admin
    .from("email_campaigns")
    .select(
      "id, status, account_id, subject, body_text, attachments, scheduled_at, started_at, per_minute, follow_up_after_days, follow_up_subject, follow_up_body, include_signature, created_at"
    )
    .in("status", ["scheduled", "sending", "sent"])
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "could not read campaigns" }, { status: 500 });
  const campaigns = (campaignRows ?? []) as CampaignRow[];
  if (campaigns.length === 0) return NextResponse.json(out);

  const { data: accounts } = await admin.from("email_accounts").select("id, status");
  const activeAccounts = new Set((accounts ?? []).filter((a) => a.status === "active").map((a) => a.id));

  // Pace: what each campaign and each mailbox already sent in the last minute (claims included).
  const minuteAgo = new Date(started - MINUTE_MS).toISOString();
  const ids = campaigns.map((c) => c.id);
  const { data: recentRows } = await admin
    .from("campaign_recipients")
    .select("campaign_id")
    .in("campaign_id", ids)
    .or(`sent_at.gt.${minuteAgo},follow_up_sent_at.gt.${minuteAgo}`);
  const recentByCampaign = new Map<string, number>();
  for (const r of recentRows ?? []) recentByCampaign.set(r.campaign_id, (recentByCampaign.get(r.campaign_id) ?? 0) + 1);
  const accountBudget = new Map<string, number>();
  for (const c of campaigns) {
    if (!c.account_id) continue;
    const used = recentByCampaign.get(c.id) ?? 0;
    accountBudget.set(c.account_id, (accountBudget.get(c.account_id) ?? ACCOUNT_PER_MINUTE) - used);
  }

  const outOfTime = () => Date.now() - started > TIME_BUDGET_MS;
  const allowanceFor = (c: CampaignRow) =>
    c.account_id ? Math.max(0, Math.min(c.per_minute - (recentByCampaign.get(c.id) ?? 0), accountBudget.get(c.account_id) ?? 0)) : 0;
  const spend = (c: CampaignRow) => {
    recentByCampaign.set(c.id, (recentByCampaign.get(c.id) ?? 0) + 1);
    if (c.account_id) accountBudget.set(c.account_id, (accountBudget.get(c.account_id) ?? 0) - 1);
  };

  // 2. First emails.
  for (const c of campaigns) {
    if (c.status === "sent" || outOfTime()) continue;
    if (c.scheduled_at && c.scheduled_at > nowIso()) continue;
    // A disconnected mailbox holds the campaign (nothing fails); it resumes once reconnected.
    if (!c.account_id || !activeAccounts.has(c.account_id)) continue;
    if (c.status === "scheduled") {
      await admin.from("email_campaigns").update({ status: "sending", started_at: c.started_at ?? nowIso(), updated_at: nowIso() }).eq("id", c.id).eq("status", "scheduled");
      c.status = "sending";
    }
    const allowance = allowanceFor(c);
    if (allowance > 0) {
      const { data: pending } = await admin
        .from("campaign_recipients")
        .select("id, email, lead_id, merge, subject_override, body_override")
        .eq("campaign_id", c.id)
        .eq("status", "pending")
        .is("sent_at", null)
        .order("created_at", { ascending: true })
        .limit(allowance);
      const attachments = toAttachments(c.attachments);
      for (const r of pending ?? []) {
        if (outOfTime()) break;
        // Paused or cancelled from the CRM while this call was running: stop here.
        const { data: live } = await admin.from("email_campaigns").select("status").eq("id", c.id).maybeSingle();
        if (live?.status !== "sending") break;
        const why = await blocked(admin, r.email, r.lead_id);
        if (why) {
          await admin.from("campaign_recipients").update({ status: "skipped", skip_reason: why }).eq("id", r.id).eq("status", "pending");
          out.skipped += 1;
          continue;
        }
        if (!(await claimFirst(admin, r.id, nowIso()))) continue;
        spend(c);
        const values = toMerge(r.merge);
        const result = await sendEmail({
          accountId: c.account_id,
          to: r.email,
          subject: renderMerge(r.subject_override ?? c.subject, values).replace(/[\r\n]+/g, " ").trim(),
          body: renderMerge(r.body_override ?? c.body_text, values).trim(),
          leadId: r.lead_id,
          attachments,
          campaignId: c.id,
          includeSignature: c.include_signature !== false,
          sentBy: SENT_BY,
        }).catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : "Send failed" }));
        if (result.ok) {
          await admin.from("campaign_recipients").update({ status: "sent", sent_at: nowIso(), error: null }).eq("id", r.id);
          out.sent += 1;
        } else {
          await admin.from("campaign_recipients").update({ status: "failed", sent_at: null, error: result.error.slice(0, 500) }).eq("id", r.id);
          if (isHardBounce(result.error)) await suppress(admin, r.email, "bounce");
          out.failed += 1;
        }
        await sleep(gapFor(c.per_minute));
      }
    }
    const { count } = await admin
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .eq("status", "pending");
    if (count === 0) {
      await admin.from("email_campaigns").update({ status: "sent", finished_at: nowIso(), updated_at: nowIso() }).eq("id", c.id).eq("status", "sending");
      c.status = "sent";
      out.finished += 1;
    }
  }

  // 3. Automatic follow-ups, to people who haven't replied, after the campaign's wait.
  for (const c of campaigns) {
    if (outOfTime()) break;
    if (!c.follow_up_after_days || !c.follow_up_body?.trim()) continue;
    if (c.status !== "sending" && c.status !== "sent") continue;
    if (!c.account_id || !activeAccounts.has(c.account_id)) continue;
    const allowance = allowanceFor(c);
    if (allowance === 0) continue;
    const dueBefore = new Date(Date.now() - c.follow_up_after_days * DAY_MS).toISOString();
    const { data: due } = await admin
      .from("campaign_recipients")
      .select("id, email, lead_id, merge, subject_override, sent_at")
      .eq("campaign_id", c.id)
      .eq("status", "sent")
      .eq("step", 1)
      .is("follow_up_sent_at", null)
      .is("replied_at", null)
      .lte("sent_at", dueBefore)
      .order("sent_at", { ascending: true })
      .limit(allowance);
    for (const r of due ?? []) {
      if (outOfTime()) break;
      const { data: live } = await admin.from("email_campaigns").select("status, follow_up_after_days").eq("id", c.id).maybeSingle();
      if (!live || (live.status !== "sending" && live.status !== "sent") || !live.follow_up_after_days) break;
      const why = await blocked(admin, r.email, r.lead_id);
      // Anything else they wrote, or anything we sent them since (a reply by hand, the CRM's own
      // follow-up), makes this automatic nudge wrong. Record why and leave them be.
      const after = r.sent_at ?? nowIso();
      const [fromThem, toThem] = await Promise.all([
        admin.from("email_messages").select("id").eq("from_address", r.email).eq("direction", "in").gt("created_at", after).limit(1),
        admin.from("email_messages").select("id, campaign_id").eq("to_address", r.email).eq("direction", "out").gt("created_at", after).limit(5),
      ]);
      const touched = Boolean(fromThem.data?.length) || (toThem.data ?? []).some((m) => m.campaign_id !== c.id);
      if (why || touched) {
        await admin
          .from("campaign_recipients")
          .update({ step: 2, skip_reason: `Follow-up skipped: ${why ?? "there was other email with them since"}` })
          .eq("id", r.id)
          .eq("step", 1);
        out.skipped += 1;
        continue;
      }
      if (!(await claimFollowUp(admin, r.id, nowIso()))) continue;
      spend(c);
      const values = toMerge(r.merge);
      const firstSubject = renderMerge(r.subject_override ?? c.subject, values);
      const subject = c.follow_up_subject?.trim() ? renderMerge(c.follow_up_subject, values) : replySubject(firstSubject);
      const { data: original } = await admin
        .from("email_messages")
        .select("id")
        .eq("campaign_id", c.id)
        .eq("to_address", r.email)
        .eq("direction", "out")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const result = await sendEmail({
        accountId: c.account_id,
        to: r.email,
        subject: subject.replace(/[\r\n]+/g, " ").trim(),
        body: renderMerge(c.follow_up_body, values).trim(),
        leadId: r.lead_id,
        replyToMessageId: original?.id ?? null,
        campaignId: c.id,
        includeSignature: c.include_signature !== false,
        sentBy: SENT_BY,
      }).catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : "Send failed" }));
      if (result.ok) out.followUps += 1;
      else {
        // Not retried: step stays 2 with the error, so the campaign page shows the failed follow-up.
        await admin.from("campaign_recipients").update({ follow_up_sent_at: null, error: `Follow-up failed: ${result.error}`.slice(0, 500) }).eq("id", r.id);
        out.failed += 1;
      }
      await sleep(gapFor(c.per_minute));
    }
  }

  return NextResponse.json(out);
}
