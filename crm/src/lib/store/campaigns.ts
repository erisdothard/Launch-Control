// Mass email campaigns: one message sent to each recipient individually, paced, with an optional
// automatic follow-up to anyone who hasn't replied. The sending itself happens in
// src/app/api/automation/send-campaigns (called every minute by the worker).
import { getStoreClient, type StoreClient } from "./db";
import type { Database, Json } from "@/lib/supabase/types";
import type { EmailAttachment } from "@/lib/email/send";
import type { AudienceLead } from "@/components/compose/audience";
import { getLeads } from "./leads";
import { matchesView, LEAD_VIEWS } from "./types";

export type CampaignStatus = "draft" | "scheduled" | "sending" | "paused" | "sent" | "cancelled";
export type RecipientStatus = "pending" | "sent" | "failed" | "skipped" | "cancelled";

export interface CampaignCounts {
  total: number;
  sent: number;
  pending: number;
  failed: number;
  skipped: number;
  cancelled: number;
  replied: number;
  followUpsSent: number;
}

export interface CampaignSummary {
  id: string;
  name: string;
  subject: string;
  status: CampaignStatus;
  accountId: string | null;
  fromAddress: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  perMinute: number;
  followUpAfterDays: number | null;
  counts: CampaignCounts;
}

export interface CampaignRecipient {
  id: string;
  email: string;
  leadId: string | null;
  merge: Record<string, string>;
  subjectOverride: string | null;
  bodyOverride: string | null;
  status: RecipientStatus;
  skipReason: string | null;
  error: string | null;
  step: number;
  sentAt: string | null;
  repliedAt: string | null;
  followUpSentAt: string | null;
}

export interface CampaignDetail extends CampaignSummary {
  bodyText: string;
  /** Signed with the sending address's signature (email_campaigns.include_signature). */
  includeSignature: boolean;
  attachments: EmailAttachment[];
  skipContactedDays: number;
  followUpSubject: string | null;
  followUpBody: string | null;
  recipients: CampaignRecipient[];
}

interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  body_text: string;
  status: string;
  account_id: string | null;
  attachments: Json;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  created_by: string | null;
  per_minute: number;
  skip_contacted_days: number;
  follow_up_after_days: number | null;
  follow_up_subject: string | null;
  follow_up_body: string | null;
  include_signature: boolean;
  email_accounts?: { address: string } | null;
}

interface RecipientRow {
  id: string;
  campaign_id: string;
  email: string;
  lead_id: string | null;
  merge: Json;
  subject_override: string | null;
  body_override: string | null;
  status: string;
  skip_reason: string | null;
  error: string | null;
  step: number;
  sent_at: string | null;
  replied_at: string | null;
  follow_up_sent_at: string | null;
}

const PAGE = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** jsonb merge values arrive untyped; keep strings only. */
export function toMerge(value: Json): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) if (typeof v === "string") out[k] = v;
  return out;
}

export function toAttachments(value: Json): EmailAttachment[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[]).filter(isRecord).flatMap((a) =>
    typeof a.name === "string" && typeof a.path === "string"
      ? [{ name: a.name, path: a.path, size: typeof a.size === "number" ? a.size : 0, type: typeof a.type === "string" ? a.type : "" }]
      : []
  );
}

function emptyCounts(): CampaignCounts {
  return { total: 0, sent: 0, pending: 0, failed: 0, skipped: 0, cancelled: 0, replied: 0, followUpsSent: 0 };
}

export function countRecipients(rows: Pick<CampaignRecipient, "status" | "repliedAt" | "followUpSentAt">[]): CampaignCounts {
  const c = emptyCounts();
  for (const r of rows) {
    c.total += 1;
    if (r.status in c) c[r.status as RecipientStatus] += 1;
    if (r.repliedAt) c.replied += 1;
    if (r.followUpSentAt) c.followUpsSent += 1;
  }
  return c;
}

function rowToRecipient(r: RecipientRow): CampaignRecipient {
  return {
    id: r.id,
    email: r.email,
    leadId: r.lead_id,
    merge: toMerge(r.merge),
    subjectOverride: r.subject_override,
    bodyOverride: r.body_override,
    status: r.status as RecipientStatus,
    skipReason: r.skip_reason,
    error: r.error,
    step: r.step,
    sentAt: r.sent_at,
    repliedAt: r.replied_at,
    followUpSentAt: r.follow_up_sent_at,
  };
}

function rowToSummary(row: CampaignRow, counts: CampaignCounts): CampaignSummary {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    status: row.status as CampaignStatus,
    accountId: row.account_id,
    fromAddress: row.email_accounts?.address ?? null,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    perMinute: row.per_minute,
    followUpAfterDays: row.follow_up_after_days,
    counts,
  };
}

const CAMPAIGN_COLUMNS =
  "id, name, subject, body_text, status, account_id, attachments, scheduled_at, started_at, finished_at, created_at, created_by, per_minute, skip_contacted_days, follow_up_after_days, follow_up_subject, follow_up_body, include_signature, email_accounts(address)";

/** Every campaign, newest first, with recipient counts. */
export async function listCampaigns(client?: StoreClient): Promise<CampaignSummary[]> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("email_campaigns").select(CAMPAIGN_COLUMNS).order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data as unknown as CampaignRow[];
  if (rows.length === 0) return [];

  // Counts for all campaigns, read a page at a time (PostgREST caps a read at 1000 rows).
  const byCampaign = new Map<string, Pick<CampaignRecipient, "status" | "repliedAt" | "followUpSentAt">[]>();
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: pageError } = await supabase
      .from("campaign_recipients")
      .select("campaign_id, status, replied_at, follow_up_sent_at")
      .order("id")
      .range(from, from + PAGE - 1);
    if (pageError) throw pageError;
    for (const r of page) {
      const list = byCampaign.get(r.campaign_id) ?? [];
      list.push({ status: r.status as RecipientStatus, repliedAt: r.replied_at, followUpSentAt: r.follow_up_sent_at });
      byCampaign.set(r.campaign_id, list);
    }
    if (page.length < PAGE) break;
  }
  return rows.map((row) => rowToSummary(row, countRecipients(byCampaign.get(row.id) ?? [])));
}

export async function getCampaign(id: string, client?: StoreClient): Promise<CampaignDetail | null> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("email_campaigns").select(CAMPAIGN_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as CampaignRow;
  const recipients: CampaignRecipient[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: pageError } = await supabase
      .from("campaign_recipients")
      .select("*")
      .eq("campaign_id", id)
      .order("created_at")
      .order("id")
      .range(from, from + PAGE - 1);
    if (pageError) throw pageError;
    recipients.push(...(page as RecipientRow[]).map(rowToRecipient));
    if (page.length < PAGE) break;
  }
  return {
    ...rowToSummary(row, countRecipients(recipients)),
    bodyText: row.body_text,
    includeSignature: row.include_signature !== false,
    attachments: toAttachments(row.attachments),
    skipContactedDays: row.skip_contacted_days,
    followUpSubject: row.follow_up_subject,
    followUpBody: row.follow_up_body,
    recipients,
  };
}

export interface NewCampaign {
  name: string;
  accountId: string;
  subject: string;
  bodyText: string;
  attachments: EmailAttachment[];
  status: "draft" | "scheduled";
  scheduledAt: string | null;
  perMinute: number;
  skipContactedDays: number;
  followUpAfterDays: number | null;
  followUpSubject: string | null;
  followUpBody: string | null;
  includeSignature: boolean;
  createdBy: string;
}

export interface NewRecipient {
  email: string;
  leadId: string | null;
  merge: Record<string, string>;
  subjectOverride: string | null;
  bodyOverride: string | null;
  status: "pending" | "skipped";
  skipReason: string | null;
}

function campaignInsert(c: NewCampaign) {
  return {
    name: c.name,
    account_id: c.accountId,
    subject: c.subject,
    body_text: c.bodyText,
    attachments: c.attachments as unknown as Json,
    status: c.status,
    scheduled_at: c.scheduledAt,
    per_minute: c.perMinute,
    skip_contacted_days: c.skipContactedDays,
    follow_up_after_days: c.followUpAfterDays,
    follow_up_subject: c.followUpSubject,
    follow_up_body: c.followUpBody,
    include_signature: c.includeSignature,
    created_by: c.createdBy,
  };
}

async function insertRecipients(supabase: StoreClient, campaignId: string, recipients: NewRecipient[]): Promise<void> {
  for (let i = 0; i < recipients.length; i += 500) {
    const { error } = await supabase.from("campaign_recipients").insert(
      recipients.slice(i, i + 500).map((r) => ({
        campaign_id: campaignId,
        email: r.email,
        lead_id: r.leadId,
        merge: r.merge,
        subject_override: r.subjectOverride,
        body_override: r.bodyOverride,
        status: r.status,
        skip_reason: r.skipReason,
      }))
    );
    if (error) throw error;
  }
}

/**
 * Creates a campaign and its recipients. It is written as a draft and only flipped to scheduled
 * once every recipient row is in, so the sender never sees a scheduled campaign with a partial
 * list. If the recipients fail to save, the campaign is removed.
 */
export async function createCampaign(c: NewCampaign, recipients: NewRecipient[], client?: StoreClient): Promise<string> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("email_campaigns").insert({ ...campaignInsert(c), status: "draft" }).select("id").single();
  if (error) throw error;
  try {
    await insertRecipients(supabase, data.id, recipients);
    if (c.status !== "draft") await publish(supabase, data.id, c.status);
  } catch (err) {
    await supabase.from("email_campaigns").delete().eq("id", data.id);
    throw err;
  }
  return data.id;
}

async function publish(supabase: StoreClient, id: string, status: NewCampaign["status"]): Promise<void> {
  const { error } = await supabase.from("email_campaigns").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "draft");
  if (error) throw error;
}

/**
 * Rewrites a draft in place: its settings, and its recipient list from scratch. Drafts only. It
 * stays a draft until the new recipients are in; scheduling it is the last write.
 */
export async function replaceDraft(id: string, c: NewCampaign, recipients: NewRecipient[], client?: StoreClient): Promise<boolean> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("email_campaigns")
    .update({ ...campaignInsert(c), status: "draft", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (error) throw error;
  if (!data.length) return false;
  const { error: delError } = await supabase.from("campaign_recipients").delete().eq("campaign_id", id);
  if (delError) throw delError;
  await insertRecipients(supabase, id, recipients);
  if (c.status !== "draft") await publish(supabase, id, c.status);
  return true;
}

export type CampaignControl = "pause" | "resume" | "cancel" | "delete_draft";

/** Pause, resume, cancel, or throw away a draft. Returns an error sentence, or null when done. */
export async function controlCampaign(id: string, action: CampaignControl, client?: StoreClient): Promise<string | null> {
  const supabase = await getStoreClient(client);
  const { data: c, error } = await supabase.from("email_campaigns").select("status, started_at").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!c) return "That campaign no longer exists.";
  const now = new Date().toISOString();

  if (action === "delete_draft") {
    if (c.status !== "draft") return "Only drafts can be deleted. Cancel it instead.";
    const { error: delError } = await supabase.from("email_campaigns").delete().eq("id", id).eq("status", "draft");
    if (delError) throw delError;
    return null;
  }
  if (action === "pause") {
    if (c.status !== "scheduled" && c.status !== "sending") return "Only a campaign that is scheduled or sending can be paused.";
    const { error: upError } = await supabase.from("email_campaigns").update({ status: "paused", updated_at: now }).eq("id", id);
    if (upError) throw upError;
    return null;
  }
  if (action === "resume") {
    if (c.status !== "paused") return "That campaign isn't paused.";
    const { error: upError } = await supabase
      .from("email_campaigns")
      .update({ status: c.started_at ? "sending" : "scheduled", updated_at: now })
      .eq("id", id);
    if (upError) throw upError;
    // Clear why the sender paused it (column from migration 20261021000041; ignored until applied).
    await supabase
      .from("email_campaigns")
      .update({ pause_reason: null } as Database["public"]["Tables"]["email_campaigns"]["Update"])
      .eq("id", id);
    return null;
  }
  // Cancel: nothing more goes out, including follow-ups. What was sent stays sent.
  if (c.status === "sent" || c.status === "cancelled") {
    const { error: upError } = await supabase
      .from("email_campaigns")
      .update({ follow_up_after_days: null, updated_at: now })
      .eq("id", id);
    if (upError) throw upError;
    return c.status === "cancelled" ? "That campaign was already cancelled." : null;
  }
  const { error: upError } = await supabase
    .from("email_campaigns")
    .update({ status: "cancelled", finished_at: now, updated_at: now })
    .eq("id", id);
  if (upError) throw upError;
  const { error: rError } = await supabase
    .from("campaign_recipients")
    .update({ status: "cancelled" })
    .eq("campaign_id", id)
    .eq("status", "pending");
  if (rError) throw rError;
  return null;
}

/** Addresses never to email again (opt-outs, bounces, manual). */
export async function getSuppressedEmails(client?: StoreClient): Promise<string[]> {
  const supabase = await getStoreClient(client);
  const out: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("email_suppressions").select("email").order("email").range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...data.map((r) => r.email.toLowerCase()));
    if (data.length < PAGE) break;
  }
  return out;
}

/** Every lead, cut down to what the composer needs, with the saved views each one is in. */
export async function getAudienceLeads(today: string, client?: StoreClient): Promise<AudienceLead[]> {
  const leads = await getLeads(undefined, client);
  return leads.map((l) => ({
    id: l.id,
    businessName: l.businessName,
    email: l.email,
    contactName: l.prospect?.contactName ?? "",
    title: l.prospect?.contactTitle ?? "",
    city: l.prospect?.city ?? "",
    state: l.prospect?.state ?? "",
    website: l.prospect?.website ?? "",
    phone: l.phone,
    status: l.status,
    source: l.source,
    doNotContact: l.doNotContact,
    callList: l.callList,
    lastContactedAt: l.lastContactedAt,
    views: LEAD_VIEWS.filter((v) => v.key !== "all" && matchesView(l, v.key, today)).map((v) => v.key),
  }));
}

/**
 * Sending addresses with what the signature needs, for the composer's Send as switch. A
 * disconnected one is included (marked by its status) so the choice stays visible.
 */
export async function getSendingAccounts(client?: StoreClient): Promise<
  {
    id: string;
    address: string;
    displayName: string;
    provider: string;
    signatureName: string;
    signatureTitle: string;
    signaturePhone: string;
    signatureLines: string;
    status: string;
    mailbox: string | null;
  }[]
> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("email_accounts")
    .select("id, address, display_name, provider, signature_name, signature_title, signature_phone, signature_lines, status, mailbox")
    .neq("status", "disabled")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((a) => ({
    id: a.id,
    address: a.address,
    displayName: a.display_name,
    provider: a.provider,
    signatureName: a.signature_name,
    signatureTitle: a.signature_title,
    signaturePhone: a.signature_phone,
    signatureLines: a.signature_lines,
    status: a.status,
    mailbox: a.mailbox,
  }));
}
