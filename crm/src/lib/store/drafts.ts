import { getStoreClient, type StoreClient } from "./db";
import { AUTOMATION_SENDER, startOfTeamDay } from "@/lib/email/teamDay";

// Emails the worker wrote for a person to look over (tools/leadgen/leadgen/automation.py):
// a reply to every message a lead sends, and follow-ups when automatic sending is off. They show
// in the Inbox under Drafts.
export type DraftKind = "reply" | "follow_up";

export interface EmailDraft {
  id: string;
  leadId: string;
  businessName: string;
  contactName: string | null;
  kind: DraftKind;
  followUpNumber: number | null;
  to: string;
  subject: string;
  body: string;
  createdAt: string;
  /** Why the last send attempt failed, when it did. */
  error: string | null;
  /** The message a reply draft answers (email_messages id); the send threads under it. */
  replyToMessageId: string | null;
  /** What they wrote, for reply drafts, so the reviewer sees what is being answered. */
  replyingTo: { subject: string; body: string; at: string } | null;
}

/** Where a lead goes when it never answered any follow-up. */
export type AfterLastFollowUp = "nurture" | "lost" | "none";
export const AFTER_LAST_FOLLOW_UP: AfterLastFollowUp[] = ["nurture", "lost", "none"];

export interface AutomationSettings {
  autoSendFollowUps: boolean;
  draftReplies: boolean;
  followUpDays: number[];
  /** Days after the last follow-up before afterLastFollowUp applies. */
  coldAfterDays: number;
  afterLastFollowUp: AfterLastFollowUp;
  dailySendCap: number;
}

interface DraftRow {
  id: string;
  lead_id: string;
  kind: string;
  follow_up_number: number | null;
  to_address: string;
  subject: string;
  body_text: string;
  created_at: string;
  error: string | null;
  reply_to_message_id: string | null;
  leads: { business_name: string; contact_name: string | null } | null;
  email_messages: { subject: string; body_text: string; created_at: string } | null;
}

function rowToDraft(row: DraftRow): EmailDraft {
  return {
    id: row.id,
    leadId: row.lead_id,
    businessName: row.leads?.business_name ?? "Unknown lead",
    contactName: row.leads?.contact_name ?? null,
    kind: row.kind === "follow_up" ? "follow_up" : "reply",
    followUpNumber: row.follow_up_number,
    to: row.to_address,
    subject: row.subject,
    body: row.body_text,
    createdAt: row.created_at,
    error: row.error,
    replyToMessageId: row.reply_to_message_id,
    replyingTo: row.email_messages
      ? { subject: row.email_messages.subject, body: row.email_messages.body_text, at: row.email_messages.created_at }
      : null,
  };
}

const DRAFT_SELECT =
  "id, lead_id, kind, follow_up_number, to_address, subject, body_text, created_at, error, reply_to_message_id, leads(business_name, contact_name), email_messages(subject, body_text, created_at)";

/** Pending drafts, replies first (someone is waiting on those), then oldest first. */
export async function getPendingDrafts(client?: StoreClient): Promise<EmailDraft[]> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("email_drafts")
    .select(DRAFT_SELECT)
    .eq("status", "pending")
    .order("kind", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as unknown as DraftRow[]).map(rowToDraft);
}

export async function getDraft(id: string, client?: StoreClient): Promise<EmailDraft | null> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("email_drafts").select(DRAFT_SELECT).eq("id", id).eq("status", "pending").maybeSingle();
  if (error) throw error;
  return data ? rowToDraft(data as unknown as DraftRow) : null;
}

export async function getPendingDraftCount(client?: StoreClient): Promise<number> {
  const supabase = await getStoreClient(client);
  const { count, error } = await supabase.from("email_drafts").select("id", { count: "exact", head: true }).eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}

export async function markDraft(
  id: string,
  patch: { status: "pending" | "sent" | "discarded"; sentBy?: string; error?: string; subject?: string; body?: string },
  client?: StoreClient,
  opts: { onlyIfPending?: boolean } = {}
): Promise<void> {
  const supabase = await getStoreClient(client);
  const now = new Date().toISOString();
  let query = supabase
    .from("email_drafts")
    .update({
      status: patch.status,
      updated_at: now,
      ...(patch.status === "sent" && { sent_at: now, sent_by: patch.sentBy ?? null }),
      ...(patch.error !== undefined && { error: patch.error }),
      ...(patch.subject !== undefined && { subject: patch.subject }),
      ...(patch.body !== undefined && { body_text: patch.body }),
    })
    .eq("id", id);
  if (opts.onlyIfPending) query = query.eq("status", "pending");
  const { error } = await query;
  if (error) throw error;
}

export async function getAutomationSettings(client?: StoreClient): Promise<AutomationSettings> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("automation_settings").select("*").eq("id", true).maybeSingle();
  if (error) throw error;
  return {
    autoSendFollowUps: data?.auto_send_follow_ups ?? false,
    draftReplies: data?.draft_replies ?? true,
    followUpDays: data?.follow_up_days ?? [3, 4, 7],
    coldAfterDays: data?.cold_after_days ?? 7,
    afterLastFollowUp: AFTER_LAST_FOLLOW_UP.find((v) => v === data?.after_last_follow_up) ?? "nurture",
    dailySendCap: data?.daily_send_cap ?? 25,
  };
}

export async function updateAutomationSettings(patch: Partial<AutomationSettings>, client?: StoreClient): Promise<void> {
  const supabase = await getStoreClient(client);
  const { error } = await supabase
    .from("automation_settings")
    .update({
      updated_at: new Date().toISOString(),
      ...(patch.autoSendFollowUps !== undefined && { auto_send_follow_ups: patch.autoSendFollowUps }),
      ...(patch.draftReplies !== undefined && { draft_replies: patch.draftReplies }),
      ...(patch.followUpDays !== undefined && { follow_up_days: patch.followUpDays }),
      ...(patch.coldAfterDays !== undefined && { cold_after_days: patch.coldAfterDays }),
      ...(patch.afterLastFollowUp !== undefined && { after_last_follow_up: patch.afterLastFollowUp }),
      ...(patch.dailySendCap !== undefined && { daily_send_cap: patch.dailySendCap }),
    })
    .eq("id", true);
  if (error) throw error;
}

/**
 * Takes a pending draft for sending: flips it to "sent" only if it is still pending, so two clicks,
 * two tabs or the follow-up sender can't send it twice. False when someone else got there first.
 */
export async function claimDraft(id: string, sentBy: string, client?: StoreClient): Promise<boolean> {
  const supabase = await getStoreClient(client);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("email_drafts")
    .update({ status: "sent", sent_at: now, sent_by: sentBy, updated_at: now })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

export interface AutopilotPulse {
  /** Leads waiting on an answer, by how many follow-ups they've had (index 0 = only the first email). */
  onTrack: number[];
  goneQuiet: number;
  sentToday: number;
  draftsWaiting: number;
}

/** What the follow-up track is doing right now, for the Autopilot tab. Same filters as the worker's queue. */
export async function getAutopilotPulse(maxFollowUps: number, client?: StoreClient): Promise<AutopilotPulse> {
  const supabase = await getStoreClient(client);
  const [waiting, quiet, sent, drafts] = await Promise.all([
    supabase.from("leads").select("follow_up_count").eq("awaiting", "them").in("status", ["contacted", "replied"]).limit(10000),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "nurture"),
    supabase
      .from("email_messages")
      .select("id", { count: "exact", head: true })
      .eq("sent_by", AUTOMATION_SENDER)
      .eq("status", "sent")
      .gte("created_at", startOfTeamDay()),
    supabase.from("email_drafts").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  for (const r of [waiting, quiet, sent, drafts]) if (r.error) throw r.error;
  const onTrack = Array.from({ length: maxFollowUps + 1 }, () => 0);
  for (const row of waiting.data ?? []) onTrack[Math.min(row.follow_up_count ?? 0, maxFollowUps)] += 1;
  return { onTrack, goneQuiet: quiet.count ?? 0, sentToday: sent.count ?? 0, draftsWaiting: drafts.count ?? 0 };
}
