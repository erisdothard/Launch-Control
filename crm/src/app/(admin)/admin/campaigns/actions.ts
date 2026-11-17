"use server";

import { revalidatePath } from "next/cache";
import { MAX_TOTAL_MB, validAttachment } from "@/lib/email/attachments";
import { buildContext, evaluateAudience, EXCLUDE_LABELS, isValidEmail, type Candidate } from "@/components/compose/audience";
import type { DomainVerdict } from "@/lib/email/addressCheck";
import { undeliverableAddresses, verifyDomains } from "@/lib/email/verifyAddress";
import {
  MAX_ATTACHMENTS,
  MAX_PER_MINUTE,
  MAX_RECIPIENTS,
  MAX_TOTAL_ATTACHMENT_BYTES,
  type CampaignPayload,
  type ComposerTemplate,
  type EmailAttachment,
  DEFAULT_DAILY_LIMIT,
  MAX_DAILY_LIMIT,
  MAX_EXTRA_FOLLOW_UPS,
} from "@/components/compose/types";
import { renderMerge, renderRecipient, teamLocalToUtc, type MergeValues } from "@/lib/email/merge";
import { sendEmail } from "@/lib/email/send";
import { currentCrmUserEmail } from "@/lib/email/session";
import {
  controlCampaign,
  createCampaign,
  getAudienceLeads,
  getCampaign,
  getSuppressedEmails,
  removeDraftRecipient,
  replaceDraft,
  sendDraft,
  updateDraftRecipient,
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

/** days, null (no reminder), undefined (not picked yet), or "invalid". */
function reminderChoice(value: unknown): number | null | undefined | "invalid" {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return int(value, 1, 60) ?? "invalid";
}

interface Validated {
  name: string;
  accountId: string;
  includeSignature: boolean;
  subject: string;
  body: string;
  attachments: EmailAttachment[];
  perMinute: number;
  dailyLimit: number;
  skipDays: number;
  scheduledAt: string | null;
  followUp: { days: number; subject: string; body: string; more: { days: number; subject: string; body: string }[] } | null;
  reminderDays: number | null;
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
  const dailyLimit = int(p.dailyLimit ?? DEFAULT_DAILY_LIMIT, 1, MAX_DAILY_LIMIT);
  if (dailyLimit === null) return `The daily limit must be between 1 and ${MAX_DAILY_LIMIT} emails.`;
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
    const more: { days: number; subject: string; body: string }[] = [];
    const extra = Array.isArray(p.followUp.more) ? p.followUp.more : [];
    if (extra.length > MAX_EXTRA_FOLLOW_UPS) return `Up to ${MAX_EXTRA_FOLLOW_UPS + 1} follow-ups in all.`;
    for (const [i, step] of extra.entries()) {
      const n = i + 2;
      const stepDays = int(step?.days, 1, 60);
      const stepBody = str(step?.body, MAX_BODY + 1).trim();
      const stepSubject = str(step?.subject, MAX_SUBJECT + 1).replace(/[\r\n]+/g, " ").trim();
      if (stepDays === null) return `Send follow-up ${n} after 1 to 60 days.`;
      if (forSending && !stepBody) return `Write follow-up ${n}, or remove it.`;
      if (stepBody.length > MAX_BODY || stepSubject.length > MAX_SUBJECT) return `Follow-up ${n} is too long.`;
      if (stepBody) more.push({ days: stepDays, subject: stepSubject, body: stepBody });
    }
    followUp = { days, subject: fuSubject, body: fuBody, more };
  }

  // Max picks the follow-up reminder before a campaign sends; a draft may leave it for later.
  const reminder = reminderChoice(p.reminderDays);
  if (reminder === "invalid") return "Pick a follow-up reminder.";
  if (forSending && reminder === undefined) return "Pick when to be reminded to follow up, or No reminder.";

  const attachments = cleanAttachments(p.attachments);
  if (typeof attachments === "string") return attachments;

  const candidates = cleanCandidates(p.candidates);
  const [leads, suppressed] = await Promise.all([getAudienceLeads(teamTodayISO()), getSuppressedEmails()]);
  const overrides = Array.isArray(p.overrides) ? p.overrides.filter((k): k is string => typeof k === "string") : [];
  // Addresses that can only bounce (dead domain, provider typo) are set aside, not sent. A DNS
  // lookup that times out counts as fine: this never blocks the save or drops someone on a guess.
  const undeliverable = await undeliverableAddresses(candidates.map((c) => c.email).filter(isValidEmail));
  const { included, excluded } = evaluateAudience(candidates, buildContext(leads, suppressed, skipDays, overrides, Date.now(), undeliverable));
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
        // Can't-receive reasons are already a plain sentence ("The domain doesn't accept email").
        skipReason: !r.excluded ? null : r.excluded === "undeliverable" && r.detail ? r.detail : EXCLUDE_LABELS[r.excluded].title + (r.detail ? ` (${r.detail})` : ""),
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
    dailyLimit,
    skipDays,
    scheduledAt,
    followUp,
    reminderDays: reminder ?? null,
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
      dailyLimit: v.dailyLimit,
      skipContactedDays: v.skipDays,
      followUpAfterDays: v.followUp?.days ?? null,
      followUpSubject: v.followUp ? v.followUp.subject || null : null,
      followUpBody: v.followUp?.body ?? null,
      followUpMore: v.followUp?.more ?? [],
      includeSignature: v.includeSignature,
      followUpReminderDays: v.reminderDays,
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

const MAX_CHECK_DOMAINS = 200;
const DOMAIN = /^[a-z0-9.-]{3,253}$/;

/**
 * The composer's live check, one call per batch of new domains (debounced in the browser): which of
 * these domains can't receive email, and why. Only bad verdicts come back; a domain left out is fine
 * or couldn't be checked. Save runs the same check again, so this only has to be helpful, not trusted.
 */
export async function checkDomainsAction(domains: string[]): Promise<ActionResult<{ bad: Record<string, DomainVerdict> }>> {
  const user = await currentCrmUserEmail();
  if (!user) return { ok: false, error: "Sign in again to continue." };
  const clean = (Array.isArray(domains) ? domains : [])
    .filter((d): d is string => typeof d === "string")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => DOMAIN.test(d))
    .slice(0, MAX_CHECK_DOMAINS);
  try {
    const verdicts = await verifyDomains(clean, 8_000);
    const bad: Record<string, DomainVerdict> = {};
    for (const [domain, v] of verdicts) if (v.status === "bad") bad[domain] = v;
    return { ok: true, bad };
  } catch {
    return { ok: false, error: "Couldn't check the addresses right now. They'll be checked again when you save." };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Saves one person's email on a draft, from the review page's Edit. */
export async function editDraftEmailAction(campaignId: string, recipientId: string, subject: string, body: string): Promise<ActionResult> {
  const user = await currentCrmUserEmail();
  if (!user) return { ok: false, error: "Sign in again to continue." };
  if (!UUID.test(campaignId) || !UUID.test(recipientId)) return { ok: false, error: "That email doesn't exist." };
  const s = str(subject, MAX_SUBJECT + 1).replace(/[\r\n]+/g, " ").trim();
  const b = str(body, MAX_BODY + 1).trim();
  if (!s) return { ok: false, error: "Add a subject." };
  if (!b) return { ok: false, error: "The email is empty." };
  if (s.length > MAX_SUBJECT) return { ok: false, error: "The subject is too long." };
  if (b.length > MAX_BODY) return { ok: false, error: "The email is too long." };
  try {
    const error = await updateDraftRecipient(campaignId, recipientId, { subject: s, body: b });
    revalidateCampaigns(campaignId);
    return error ? { ok: false, error } : { ok: true };
  } catch (err) {
    console.error("editDraftEmailAction failed", campaignId, err instanceof Error ? err.message : err);
    return { ok: false, error: "Couldn't save. Try again." };
  }
}

/** Takes one person off a draft. */
export async function removeDraftPersonAction(campaignId: string, recipientId: string): Promise<ActionResult> {
  const user = await currentCrmUserEmail();
  if (!user) return { ok: false, error: "Sign in again to continue." };
  if (!UUID.test(campaignId) || !UUID.test(recipientId)) return { ok: false, error: "That person isn't on this list." };
  try {
    const error = await removeDraftRecipient(campaignId, recipientId);
    revalidateCampaigns(campaignId);
    return error ? { ok: false, error } : { ok: true };
  } catch (err) {
    console.error("removeDraftPersonAction failed", campaignId, err instanceof Error ? err.message : err);
    return { ok: false, error: "Couldn't remove them. Try again." };
  }
}

/** What the review page showed for one email: the send refuses if the list changed since. */
export interface ReviewedEmail {
  id: string;
  subject: string;
  body: string;
}

/**
 * Sends a draft as it stands, from the review page. Refuses unless the pending list is exactly
 * what the page showed (same people, same words), so nothing goes out that wasn't read. Runs the
 * same checks a new campaign gets (opted out, do not contact, call list, dead address, emailed
 * recently); anyone who fails one is left out with the reason. The sender re-checks opt-outs,
 * do not contact and dead addresses before each email.
 */
export async function sendDraftAction(
  campaignId: string,
  dailyLimit: number,
  reminderDays: number | null,
  includeSignature: boolean,
  reviewed: ReviewedEmail[]
): Promise<ActionResult<{ count: number; skipped: number }>> {
  const user = await currentCrmUserEmail();
  if (!user) return { ok: false, error: "Sign in again to continue." };
  if (!UUID.test(campaignId)) return { ok: false, error: "That campaign doesn't exist." };
  const limit = int(dailyLimit, 1, MAX_DAILY_LIMIT);
  if (limit === null) return { ok: false, error: "Pick how many a day." };
  const reminder = reminderChoice(reminderDays);
  if (reminder === undefined || reminder === "invalid") return { ok: false, error: "Pick when to be reminded to follow up, or No reminder." };
  if (!Array.isArray(reviewed)) return { ok: false, error: "Reload the page and try again." };
  try {
    const c = await getCampaign(campaignId);
    if (!c || c.status !== "draft") return { ok: false, error: "This one was already sent or deleted. Reload the page." };
    const account = await activeAccount(c.accountId ?? "");
    if (!account) return { ok: false, error: `${c.fromAddress ?? "The sending address"} needs reconnecting in Settings first.` };
    const pending = c.recipients.filter((r) => r.status === "pending");
    if (pending.length === 0) return { ok: false, error: "Nobody is on the list." };

    const seen = new Map(reviewed.map((e) => [String(e?.id), e]));
    const rendered = pending.map((r) => ({ r, ...renderRecipient(r, c.subject, c.bodyText) }));
    const changed =
      seen.size !== pending.length ||
      rendered.some(({ r, subject, body }) => {
        const e = seen.get(r.id);
        return !e || e.subject !== subject || e.body !== body;
      });
    if (changed) return { ok: false, error: "This list changed since you opened it. Reload the page, read it again, then send." };
    if (rendered.some((x) => !x.subject || !x.body)) return { ok: false, error: "One of the emails is empty. Edit it or remove that person." };

    const candidates: Candidate[] = pending.map((r) => ({ email: r.email, leadId: r.leadId, values: r.merge, origin: "draft" }));
    const [leads, suppressed, undeliverable] = await Promise.all([
      getAudienceLeads(teamTodayISO()),
      getSuppressedEmails(),
      undeliverableAddresses(pending.map((r) => r.email).filter(isValidEmail)),
    ]);
    const { excluded } = evaluateAudience(candidates, buildContext(leads, suppressed, c.skipContactedDays, [], Date.now(), undeliverable));
    // Every row per address: a duplicate address leaves out the later copies, any other reason all of them.
    const rowsByEmail = new Map<string, string[]>();
    for (const r of pending) {
      const k = r.email.trim().toLowerCase();
      rowsByEmail.set(k, [...(rowsByEmail.get(k) ?? []), r.id]);
    }
    const skipIds = new Map<string, string>();
    for (const r of excluded) {
      if (!r.excluded) continue;
      const ids = rowsByEmail.get(r.email) ?? [];
      const reason = r.excluded === "undeliverable" && r.detail ? r.detail : EXCLUDE_LABELS[r.excluded].title + (r.detail ? ` (${r.detail})` : "");
      for (const id of r.excluded === "duplicate" ? ids.slice(1) : ids) if (!skipIds.has(id)) skipIds.set(id, reason);
    }
    const skips = [...skipIds].map(([id, reason]) => ({ id, reason }));
    if (skips.length === pending.length) {
      const why = [...new Set(skips.map((s) => s.reason))].slice(0, 3).join("; ");
      return { ok: false, error: `Nobody here can be emailed: ${why}. Nothing was sent.` };
    }
    const error = await sendDraft(campaignId, limit, reminder, includeSignature === true, skips);
    revalidateCampaigns(campaignId);
    return error ? { ok: false, error } : { ok: true, count: pending.length - skips.length, skipped: skips.length };
  } catch (err) {
    console.error("sendDraftAction failed", campaignId, err instanceof Error ? err.message : err);
    return { ok: false, error: "Couldn't send. Nothing went out. Try again." };
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
