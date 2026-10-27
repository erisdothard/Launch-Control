"use server";

import { revalidatePath } from "next/cache";
import { MAX_TOTAL_MB, validAttachment } from "@/lib/email/attachments";
import { buildContext, evaluateAudience, EXCLUDE_LABELS, type Candidate } from "@/components/compose/audience";
import {
  MAX_ATTACHMENTS,
  MAX_PER_MINUTE,
  MAX_RECIPIENTS,
  MAX_TOTAL_ATTACHMENT_BYTES,
  type CampaignPayload,
  type ComposerTemplate,
  type EmailAttachment,
} from "@/components/compose/types";
import { renderMerge, teamLocalToUtc, type MergeValues } from "@/lib/email/merge";
import { sendEmail } from "@/lib/email/send";
import { currentCrmUserEmail } from "@/lib/email/session";
import {
  controlCampaign,
  createCampaign,
  getAudienceLeads,
  getSuppressedEmails,
  replaceDraft,
  type CampaignControl,
  type NewRecipient,
} from "@/lib/store/campaigns";
import { createTemplate, deleteTemplate, updateTemplate } from "@/lib/store/templates";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { teamTodayISO } from "@/lib/leads/followUp";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_SUBJECT = 200;
const MAX_BODY = 20_000;
const MAX_NAME = 120;

function revalidateCampaigns(id?: string) {
  revalidatePath("/admin/campaigns");
  if (id) revalidatePath(`/admin/campaigns/${id}`);
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function int(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

async function sendingAccount(accountId: string): Promise<{ id: string; address: string; status: string } | null> {
  if (!accountId) return null;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("email_accounts").select("id, address, status").eq("id", accountId).maybeSingle();
  return data && data.status !== "disabled" ? { id: data.id, address: data.address, status: data.status } : null;
}

async function activeAccount(accountId: string): Promise<{ id: string; address: string } | null> {
  const account = await sendingAccount(accountId);
  return account?.status === "active" ? account : null;
}

function cleanAttachments(value: unknown): EmailAttachment[] | string {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_ATTACHMENTS) return `Attach at most ${MAX_ATTACHMENTS} files.`;
  const out: EmailAttachment[] = [];
  for (const a of value) {
    const file: EmailAttachment = { name: str(a?.name, 200) || "attachment", path: str(a?.path, 400), size: Number(a?.size) || 0, type: str(a?.type, 100) };
    // Only files a composer uploaded to the private bucket; the same check sendEmail makes.
    if (!validAttachment(file)) return "One of the attachments isn't valid. Remove it and add it again.";
    out.push(file);
  }
  if (out.reduce((n, a) => n + a.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) return `Attachments add up to more than ${MAX_TOTAL_MB} MB. Most mail servers refuse that.`;
  return out;
}

function cleanCandidates(value: unknown): Candidate[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_RECIPIENTS * 2).map((c) => {
    const values: MergeValues = {};
    if (c && typeof c.values === "object" && c.values) {
      for (const [k, v] of Object.entries(c.values as Record<string, unknown>).slice(0, 40)) {
        if (typeof v === "string" && /^[a-z][a-z0-9_]{0,40}$/.test(k)) values[k] = v.slice(0, 500);
      }
    }
    return {
      email: str(c?.email, 320).trim().toLowerCase(),
      leadId: typeof c?.leadId === "string" && /^[0-9a-f-]{36}$/i.test(c.leadId) ? c.leadId : null,
      values,
      origin: str(c?.origin, 80),
    };
  });
}

interface Validated {
  name: string;
  accountId: string;
  includeSignature: boolean;
  subject: string;
  body: string;
  attachments: EmailAttachment[];
  perMinute: number;
  skipDays: number;
  scheduledAt: string | null;
  followUp: { days: number; subject: string; body: string } | null;
  recipients: NewRecipient[];
  pendingCount: number;
}

/** Checks everything the browser sent and works out the recipients again from live data. */
async function validate(p: CampaignPayload, forSending: boolean): Promise<Validated | string> {
  const subject = str(p.subject, MAX_SUBJECT + 1).replace(/[\r\n]+/g, " ").trim();
  const body = str(p.body, MAX_BODY + 1).trim();
  if (forSending && !subject) return "Add a subject in step 2.";
  if (forSending && !body) return "Write the message in step 2.";
  if (subject.length > MAX_SUBJECT) return "The subject is too long. Keep it under 200 characters.";
  if (body.length > MAX_BODY) return "The message is too long.";

  // A draft can be saved as someone whose Outlook needs reconnecting; sending can't start until it's back.
  const account = await sendingAccount(str(p.accountId, 64));
  if (!account) return "Pick who it's from in step 2.";
  if (forSending && account.status !== "active") return `${account.address} needs reconnecting in Settings before this can send. Save it as a draft for now.`;

  const perMinute = int(p.perMinute, 1, MAX_PER_MINUTE);
  if (perMinute === null) return `Pace must be between 1 and ${MAX_PER_MINUTE} emails a minute.`;
  const skipDays = int(p.skipContactedDays, 0, 365);
  if (skipDays === null) return "The recent-contact rule must be 0 to 365 days.";

  let scheduledAt: string | null = null;
  if (p.when?.mode === "schedule") {
    scheduledAt = teamLocalToUtc(str(p.when.date, 10), str(p.when.time, 5));
    if (!scheduledAt) return "Pick a date and time to send.";
    const t = new Date(scheduledAt).getTime();
    if (forSending && t < Date.now() - 5 * 60_000) return "That send time has already passed. Pick a later one, or send now.";
    if (t > Date.now() + 366 * 86_400_000) return "Schedule it within the next year.";
  }

  let followUp: Validated["followUp"] = null;
  if (p.followUp) {
    const days = int(p.followUp.days, 1, 60);
    const fuBody = str(p.followUp.body, MAX_BODY + 1).trim();
    const fuSubject = str(p.followUp.subject, MAX_SUBJECT + 1).replace(/[\r\n]+/g, " ").trim();
    if (days === null) return "Send the follow-up after 1 to 60 days.";
    if (forSending && !fuBody) return "Write the follow-up message, or turn the follow-up off.";
    if (fuBody.length > MAX_BODY || fuSubject.length > MAX_SUBJECT) return "The follow-up is too long.";
    followUp = { days, subject: fuSubject, body: fuBody };
  }

  const attachments = cleanAttachments(p.attachments);
  if (typeof attachments === "string") return attachments;

  const candidates = cleanCandidates(p.candidates);
  const [leads, suppressed] = await Promise.all([getAudienceLeads(teamTodayISO()), getSuppressedEmails()]);
  const overrides = Array.isArray(p.overrides) ? p.overrides.filter((k): k is string => typeof k === "string") : [];
  const { included, excluded } = evaluateAudience(candidates, buildContext(leads, suppressed, skipDays, overrides));
  if (forSending && included.length === 0) return "Nobody is on the list yet. Add people in step 1.";
  if (included.length > MAX_RECIPIENTS) return `That's more than ${MAX_RECIPIENTS} people. Split it into smaller campaigns.`;

  const edits = p.edits && typeof p.edits === "object" ? p.edits : {};
  const recipients: NewRecipient[] = [
    ...included.map((r) => {
      const edit = edits[r.key];
      const so = edit && typeof edit.subject === "string" ? edit.subject.replace(/[\r\n]+/g, " ").trim().slice(0, MAX_SUBJECT) : "";
      const bo = edit && typeof edit.body === "string" ? edit.body.trim().slice(0, MAX_BODY) : "";
      return {
        email: r.email,
        leadId: r.leadId,
        merge: r.values,
        subjectOverride: so || null,
        bodyOverride: bo || null,
        status: "pending" as const,
        skipReason: null,
      };
    }),
    // Left-out people are kept (as skipped, with the reason) so the campaign shows who didn't get it.
    ...excluded
      .filter((r) => r.email && r.excluded !== "duplicate" && r.excluded !== "missing_email")
      .map((r) => ({
        email: r.email,
        leadId: r.leadId,
        merge: r.values,
        subjectOverride: null,
        bodyOverride: null,
        status: "skipped" as const,
        skipReason: r.excluded ? EXCLUDE_LABELS[r.excluded].title + (r.detail ? ` (${r.detail})` : "") : null,
      })),
  ];

  return {
    name: str(p.name, MAX_NAME).trim() || subject || "Untitled campaign",
    accountId: account.id,
    includeSignature: p.includeSignature !== false,
    subject,
    body,
    attachments,
    perMinute,
    skipDays,
    scheduledAt,
    followUp,
    recipients,
    pendingCount: included.length,
  };
}

/**
 * Saves the composer: as a draft to finish later, or for sending (now, or at the scheduled time).
 * The worker's every-minute call to /api/automation/send-campaigns does the actual sending.
 */
export async function saveCampaignAction(
  payload: CampaignPayload,
  intent: "draft" | "send"
): Promise<ActionResult<{ id: string; count: number }>> {
  const user = await currentCrmUserEmail();
  if (!user) return { ok: false, error: "Sign in again to continue." };
  try {
    const v = await validate(payload, intent === "send");
    if (typeof v === "string") return { ok: false, error: v };
    const campaign = {
      name: v.name,
      accountId: v.accountId,
      subject: v.subject,
      bodyText: v.body,
      attachments: v.attachments,
      status: intent === "send" ? ("scheduled" as const) : ("draft" as const),
      scheduledAt: v.scheduledAt,
      perMinute: v.perMinute,
      skipContactedDays: v.skipDays,
      followUpAfterDays: v.followUp?.days ?? null,
      followUpSubject: v.followUp ? v.followUp.subject || null : null,
      followUpBody: v.followUp?.body ?? null,
      includeSignature: v.includeSignature,
      createdBy: user,
    };
    let id: string;
    if (payload.draftId && /^[0-9a-f-]{36}$/i.test(payload.draftId)) {
      const replaced = await replaceDraft(payload.draftId, campaign, v.recipients);
      if (!replaced) return { ok: false, error: "That draft was already sent or deleted. Start a new campaign." };
      id = payload.draftId;
    } else {
      id = await createCampaign(campaign, v.recipients);
    }
    revalidateCampaigns(id);
    return { ok: true, id, count: v.pendingCount };
  } catch {
    return { ok: false, error: "Couldn't save the campaign. Nothing was sent. Try again in a moment." };
  }
}

export async function controlCampaignAction(id: string, action: CampaignControl): Promise<ActionResult> {
  const user = await currentCrmUserEmail();
  if (!user) return { ok: false, error: "Sign in again to continue." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "That campaign doesn't exist." };
  if (!["pause", "resume", "cancel", "delete_draft"].includes(action)) return { ok: false, error: "Unknown action." };
  try {
    const error = await controlCampaign(id, action);
    revalidateCampaigns(id);
    return error ? { ok: false, error } : { ok: true };
  } catch {
    return { ok: false, error: "Couldn't change the campaign. Try again in a moment." };
  }
}

/**
 * Sends ONE copy, merged for the recipient being previewed, to the signed-in person's own address,
 * so they can see it in their inbox before it goes out. Subject starts with [Test].
 */
export async function sendTestAction(input: {
  accountId: string;
  subject: string;
  body: string;
  values: MergeValues;
  attachments: EmailAttachment[];
  includeSignature?: boolean;
}): Promise<ActionResult<{ to: string }>> {
  const user = await currentCrmUserEmail();
  if (!user) return { ok: false, error: "Sign in again to send a test." };
  const account = await activeAccount(str(input.accountId, 64));
  if (!account) return { ok: false, error: "That address needs reconnecting in Settings before it can send a test." };
  const values: MergeValues = {};
  for (const [k, v] of Object.entries(input.values ?? {})) if (typeof v === "string") values[k] = v.slice(0, 500);
  const subject = renderMerge(str(input.subject, MAX_SUBJECT), values).replace(/[\r\n]+/g, " ").trim();
  const body = renderMerge(str(input.body, MAX_BODY), values).trim();
  if (!subject || !body) return { ok: false, error: "Add a subject and a message first." };
  const attachments = cleanAttachments(input.attachments);
  if (typeof attachments === "string") return { ok: false, error: attachments };
  const result = await sendEmail({
    accountId: account.id,
    to: user,
    subject: `[Test] ${subject}`,
    body,
    attachments,
    leadId: null,
    campaignId: null,
    includeSignature: input.includeSignature !== false,
    sentBy: user,
  });
  return result.ok ? { ok: true, to: user } : { ok: false, error: result.error };
}

export async function saveTemplateAction(input: {
  id?: string | null;
  name: string;
  subject: string;
  bodyText: string;
}): Promise<ActionResult<{ template: ComposerTemplate }>> {
  const user = await currentCrmUserEmail();
  if (!user) return { ok: false, error: "Sign in again to save templates." };
  const name = str(input.name, 81).trim();
  const subject = str(input.subject, MAX_SUBJECT + 1).replace(/[\r\n]+/g, " ").trim();
  const bodyText = str(input.bodyText, MAX_BODY + 1).trim();
  if (!name) return { ok: false, error: "Give the template a name." };
  if (name.length > 80) return { ok: false, error: "Keep the name under 80 characters." };
  if (!subject && !bodyText) return { ok: false, error: "Write a subject or a message to save." };
  if (subject.length > MAX_SUBJECT || bodyText.length > MAX_BODY) return { ok: false, error: "That template is too long." };
  try {
    const t =
      input.id && /^[0-9a-f-]{36}$/i.test(input.id)
        ? await updateTemplate(input.id, { name, subject, bodyText })
        : await createTemplate({ name, subject, bodyText }, user);
    if (!t) return { ok: false, error: "That template was deleted. Save it as a new one." };
    return { ok: true, template: { id: t.id, name: t.name, subject: t.subject, bodyText: t.bodyText } };
  } catch {
    return { ok: false, error: "Couldn't save the template. Try again." };
  }
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  const user = await currentCrmUserEmail();
  if (!user) return { ok: false, error: "Sign in again." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "That template doesn't exist." };
  try {
    await deleteTemplate(id);
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't delete the template. Try again." };
  }
}
