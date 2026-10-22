import "server-only";
import { getLeadById, updateLead } from "@/lib/store/leads";
import { getThread } from "@/lib/store/messages";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { ATTACHMENT_BUCKET, MAX_TOTAL_ATTACHMENT_BYTES, MAX_TOTAL_MB, validAttachment, type EmailAttachment } from "./attachments";
import { emailConfig, outlookAppOnly, replyAddressFor } from "./config";
import { accessTokenFor, sendViaGmail } from "./gmail";
import { OutlookReconnectNeeded, sendViaOutlookSmtp, type OutboundFile } from "./outlook";
import { outlookAccessToken } from "./outlookAccount";
import { sendViaResend } from "./resend";
import { currentCrmUserEmail } from "./session";
import { SIGNATURE_LOGO_PNG_BASE64 } from "./logoData";
import { emailHtml, emailText, LOGO_CID, NAME_CID, type SignatureInput } from "./signature";
import { renderNameImage, type NameImage } from "./nameImage";
import { isEmail } from "./text";
import { isDemoMode } from "@/lib/demo/mode";
import { unsubscribeHeaders } from "./unsubscribe";

export { ATTACHMENT_BUCKET, validAttachment, type EmailAttachment };

export interface SendInput {
  leadId: string;
  accountId: string;
  to: string;
  subject: string;
  body: string;
  /** Sign with the sending address's signature. Defaults to true. */
  includeSignature?: boolean;
}

/**
 * warning: it went out, but something after the send didn't (the copy wasn't saved). The caller
 * must NOT send again; it shows the warning. code "daily_cap": refused before sending because the
 * mailbox hit its daily limit; nothing went out.
 */
export type SendResult = { ok: true; id?: string; warning?: string } | { ok: false; error: string; code?: "daily_cap" };

/**
 * One outbound email from anywhere in the CRM: the Inbox (compose, reply, reply all, forward),
 * a lead's thread, Today, or a campaign. leadId is optional: mail to someone who isn't a lead is
 * still sent, stored and threaded. replyToMessageId is our email_messages id of the message being
 * answered; the provider threads under it.
 */
export interface OutboundEmail {
  accountId: string;
  /** One address, or several separated by commas. */
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  leadId?: string | null;
  attachments?: EmailAttachment[];
  replyToMessageId?: string | null;
  campaignId?: string | null;
  /**
   * Sign it with the SENDING address's signature (its signature_name / title / phone, and the
   * address itself), under what was written and above any quoted text. Defaults to true.
   */
  includeSignature?: boolean;
  sentBy: string;
  /**
   * Mass email only: the CRM's public base URL. Adds List-Unsubscribe (signed one-click link plus
   * mailto) and List-Unsubscribe-Post headers so Gmail and Outlook show their unsubscribe button.
   */
  unsubscribeBaseUrl?: string;
}

const MAX_BODY = 20_000;
const MAX_SUBJECT = 200;
const MAX_RECIPIENTS = 50;
export const MAX_ATTACHMENT_BYTES = MAX_TOTAL_ATTACHMENT_BYTES;
/** Outbound emails one mailbox (with its aliases) may send in 24 hours. Env DAILY_SEND_CAP overrides. */
export const DAILY_SEND_CAP = positiveInt(process.env.DAILY_SEND_CAP, 400);
const DAY_MS = 86_400_000;
const SAVED_COPY_WARNING = "The email went out, but the CRM couldn't save a copy. Don't send it again; it's in Sent Items.";

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function formatFrom(displayName: string, address: string): string {
  const name = displayName.replace(/["<>\r\n]/g, "").trim();
  return name ? `${name} <${address}>` : address;
}

/** "a@x.com, b@y.com" (or ;) -> trimmed, lowercased, de-duplicated addresses. */
export function addressList(value: string | string[] | undefined): string[] {
  const parts = (Array.isArray(value) ? value : [value ?? ""]).flatMap((v) => v.split(/[,;]/));
  return [...new Set(parts.map((p) => p.trim().toLowerCase()).filter(Boolean))];
}

/** Sends one email on a lead's thread from the chosen account and records it (signed-in user). */
export async function sendLeadEmail(input: SendInput): Promise<SendResult> {
  // The team allowlist, not just a signed-in session: anyone can sign up.
  const email = await currentCrmUserEmail();
  if (!email) return { ok: false, error: "Sign in again to send." };
  return sendAsAccount({ ...input, sentBy: email });
}

export interface SendAsAccountInput extends SendInput {
  /** Who or what sent it: a CRM user's email, or e.g. "automation". */
  sentBy: string;
}

/**
 * Sends and records an email on a lead's thread without a browser session, for follow-ups and
 * drafts sent by the worker or a server action. Callers are responsible for authorizing.
 */
export function sendAsAccount(input: SendAsAccountInput): Promise<SendResult> {
  return sendEmail({
    accountId: input.accountId,
    to: input.to,
    subject: input.subject,
    body: input.body,
    leadId: input.leadId,
    includeSignature: input.includeSignature,
    sentBy: input.sentBy,
  });
}

interface ReplyTarget {
  messageIdHeader: string | null;
  conversationId: string | null;
  providerThreadId: string | null;
  provider: string;
  accountId: string | null;
  leadId: string | null;
}

/**
 * The single send path. Callers authorize first (signed-in team member, or the automation
 * secret); this runs with the service role. Sends from the chosen account with the house signature,
 * threads under replyToMessageId when given, stores the row (failed sends too, with the reason),
 * and moves the lead along only when the email is on a lead.
 */
export async function sendEmail(input: OutboundEmail): Promise<SendResult> {
  const to = addressList(input.to);
  const cc = addressList(input.cc).filter((a) => !to.includes(a));
  const bcc = addressList(input.bcc).filter((a) => !to.includes(a) && !cc.includes(a));
  const subject = input.subject.replace(/[\r\n]+/g, " ").trim().slice(0, MAX_SUBJECT);
  const body = input.body.trim();
  const files = input.attachments ?? [];
  if (!to.length) return { ok: false, error: "Add who it's going to." };
  const bad = [...to, ...cc, ...bcc].find((a) => !isEmail(a));
  if (bad) return { ok: false, error: `"${bad}" isn't a valid email address.` };
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) return { ok: false, error: `Fifty people at most. For more, use Mass email.` };
  if (!subject) return { ok: false, error: "Add a subject." };
  if (!body) return { ok: false, error: "Write a message first." };
  if (body.length > MAX_BODY) return { ok: false, error: "That message is too long." };
  if (files.length > 10 || files.some((f) => !validAttachment(f))) return { ok: false, error: "One of the attachments isn't valid. Remove it and attach it again." };
  if (files.reduce((n, f) => n + f.size, 0) > MAX_ATTACHMENT_BYTES) return { ok: false, error: `Attachments add up to more than ${MAX_TOTAL_MB} MB.` };

  const supabase = createServiceRoleClient();
  if (!supabase) return { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" };

  const { data: account } = await supabase
    .from("email_accounts")
    .select("id, provider, address, display_name, signature_name, signature_title, signature_phone, signature_lines, status, mailbox")
    .eq("id", input.accountId)
    .maybeSingle();
  if (!account) return { ok: false, error: "Pick who it's from." };
  // In app-only mode a stale "needs_reconnect" (left by an old user sign-in) means nothing.
  const usable = account.status === "active" || (account.provider === "outlook" && account.status === "needs_reconnect" && outlookAppOnly());
  if (!usable) {
    return { ok: false, error: `${account.address} needs reconnecting in Settings before it can send.` };
  }
  const sentToday = await sentInLastDay(supabase, account.mailbox ?? account.address);
  if (sentToday === null) return { ok: false, error: "Couldn't check today's sending limit. Try again in a minute." };
  if (sentToday >= DAILY_SEND_CAP) {
    return {
      ok: false,
      code: "daily_cap",
      error: `${account.mailbox ?? account.address} has sent ${DAILY_SEND_CAP} emails in the last 24 hours, its daily limit. Nothing was sent; try again tomorrow.`,
    };
  }

  const reply = input.replyToMessageId ? await replyTarget(input.replyToMessageId) : null;
  if (input.replyToMessageId && !reply) return { ok: false, error: "The message you're answering no longer exists." };
  // A reply on a lead's thread stays on that lead even when the caller didn't say so.
  const leadId = input.leadId ?? reply?.leadId ?? null;
  const lead = leadId ? await getLeadById(leadId, supabase) : null;
  if (leadId && !lead) return { ok: false, error: "That lead no longer exists." };
  const thread = lead && !reply ? await getThread(lead.id, supabase) : [];

  let outbound: OutboundFile[];
  try {
    outbound = await downloadAttachments(files);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't read an attachment." };
  }

  const from = formatFrom(account.display_name, account.address);
  // The From line is the company; the signature names the person, always from the sending row, so
  // "send as Eris" signs as Eris. Turned off, or no person set on the row, means no signature.
  const signature: SignatureInput = {
    accountId: account.id,
    name: account.signature_name,
    title: account.signature_title,
    address: account.address,
    phone: account.signature_phone,
    lines: account.signature_lines,
  };
  const sign = input.includeSignature !== false && Boolean(account.signature_name.trim());
  const signed = sign ? { text: emailText(body, signature), html: emailHtml(body, signature) } : { text: body, html: null };
  const toLine = to.join(", ");
  const headers = input.unsubscribeBaseUrl ? listUnsubscribe(to[0], lead?.id ?? null, input.unsubscribeBaseUrl, account.address) : undefined;

  // The name in Michroma for the inline send; if drawing fails the name goes as text, not unsent.
  const nameImage = sign && !isDemoMode() && account.provider === "outlook" ? await renderNameImage(signature.name).catch(() => null) : null;

  let providerMessageId: string | null = null;
  let providerThreadId: string | null = null;
  let messageIdHeader: string | null = null;
  let sendError: string | null = null;

  // The demo never reaches a mail provider: the message is stored as sent, so the thread, the
  // lead's state and the Today queue all move exactly as they would for real.
  if (isDemoMode()) {
    messageIdHeader = `<demo-${crypto.randomUUID()}@demo.golaunchcontrol.com>`;
  } else try {
    if (account.provider === "resend") {
      if (cc.length || bcc.length || outbound.length) throw new Error("This address can't send copies or attachments. Send from Outlook instead.");
      const lastInbound = [...thread].reverse().find((m) => m.direction === "in");
      const inReplyTo = reply?.messageIdHeader ?? (lastInbound ? await headerFor(lastInbound.id) : null);
      const replyTo = lead ? replyAddressFor(lead.id) : account.address;
      const sent = await sendViaResend({ from, to: toLine, subject, ...signed, replyTo, inReplyTo });
      providerMessageId = sent.id;
    } else if (account.provider === "outlook") {
      // Without an explicit reply, thread under the recipient's own last message; bounce notices
      // and other system mail don't count.
      const lastFromThem = [...thread].reverse().find((m) => m.direction === "in" && m.fromAddress.toLowerCase() === to[0]);
      const inReplyTo = reply?.messageIdHeader ?? (lastFromThem ? await headerFor(lastFromThem.id) : null);
      const sent = await sendViaOutlookSmtp(await outlookAccessToken(account.id, "smtp"), {
        fromName: account.display_name,
        fromAddress: account.address,
        // App-only mode signs in to SMTP as the one mailbox the app works on.
        mailbox: outlookAppOnly() ? emailConfig.msAppMailbox : (account.mailbox ?? account.address),
        to: toLine,
        cc,
        bcc,
        subject,
        ...signed,
        // Outlook mail embeds the signature logo and the drawn name so they show even where remote
        // images are blocked (and Outlook for Windows, which loads no web fonts).
        ...(sign && signed.html ? { html: emailHtml(body, signature, "cid", nameImage ?? undefined) } : {}),
        attachments: sign ? [...outbound, signatureLogoFile(), ...(nameImage ? [signatureNameFile(nameImage)] : [])] : outbound,
        inReplyTo,
        headers,
      });
      // The worker's Sent Items sync fills in the Graph ids later, matched on this Message-ID.
      messageIdHeader = sent.messageId;
    } else {
      const { data: refreshToken } = await supabase.rpc("gmail_refresh_token", { p_account_id: account.id });
      if (!refreshToken) throw new Error("This Gmail needs reconnecting in Settings");
      const lastGmail = [...thread].reverse().find((m) => m.provider === "gmail" && m.accountId === account.id);
      const lastInbound = [...thread].reverse().find((m) => m.direction === "in");
      const threadId =
        reply?.provider === "gmail" && reply.accountId === account.id ? reply.providerThreadId : lastGmail ? await threadFor(lastGmail.id) : null;
      const inReplyTo = reply?.messageIdHeader ?? (lastInbound ? await headerFor(lastInbound.id) : null);
      const sent = await sendViaGmail(await accessTokenFor(refreshToken), { from, to: toLine, cc, bcc, subject, ...signed, attachments: outbound, threadId, inReplyTo, headers });
      providerMessageId = sent.id;
      providerThreadId = sent.threadId;
      messageIdHeader = sent.messageId;
    }
  } catch (err) {
    sendError = err instanceof OutlookReconnectNeeded ? err.message : err instanceof Error ? err.message : "Send failed";
    if (/invalid_grant/i.test(sendError)) {
      await supabase.from("email_accounts").update({ status: "needs_reconnect" }).eq("id", account.id);
      sendError = "This Gmail connection expired. Reconnect it in Settings.";
    }
  }

  const row = {
    lead_id: lead?.id ?? null,
    account_id: account.id,
    direction: "out",
    folder: "sent",
    from_address: account.address,
    from_name: account.display_name,
    to_address: toLine,
    cc_address: cc.join(", "),
    subject,
    body_text: body,
    attachments: files.map((f) => ({ name: f.name, path: f.path, size: f.size, type: f.type })) as unknown as Json,
    provider: account.provider,
    provider_message_id: providerMessageId,
    provider_thread_id: providerThreadId,
    // Same conversation as the message answered; a new Gmail thread is its own conversation, and
    // a new Outlook one learns its id when the Sent Items sync attaches it.
    conversation_id: reply?.conversationId ?? providerThreadId,
    message_id_header: messageIdHeader,
    campaign_id: input.campaignId ?? null,
    sent_by: input.sentBy,
    status: sendError ? "failed" : "sent",
    error: sendError,
  };
  // One retry: a blip here must not turn a delivered email into a "failed" one that gets re-sent.
  let stored = await supabase.from("email_messages").insert(row).select("id").maybeSingle();
  if (stored.error) stored = await supabase.from("email_messages").insert(row).select("id").maybeSingle();

  if (sendError) return { ok: false, error: sendError };
  // Sent but not recorded: it DID go out, so ok with a warning; callers must not send it again.
  if (stored.error) return { ok: true, warning: SAVED_COPY_WARNING };
  if (lead) {
    // First touch moves a new lead along the pipeline; fill in the address if the lead had none.
    const patch: Parameters<typeof updateLead>[1] = {};
    if (lead.status === "new") patch.status = "contacted";
    // Only when the address is clearly theirs: a fresh email to them, or a reply on their own thread.
    if (!lead.email && (!reply || reply.leadId === lead.id)) patch.email = to[0];
    if (Object.keys(patch).length) await updateLead(lead.id, patch, supabase);
  }
  return { ok: true, id: stored.data?.id };
}

/** Outbound emails sent from a mailbox and its aliases in the last 24 hours; null if it can't tell. */
async function sentInLastDay(supabase: NonNullable<ReturnType<typeof createServiceRoleClient>>, mailbox: string): Promise<number | null> {
  const { data: rows, error } = await supabase.from("email_accounts").select("id").or(`address.eq.${JSON.stringify(mailbox)},mailbox.eq.${JSON.stringify(mailbox)}`);
  if (error || !rows?.length) return error ? null : 0;
  const { count, error: countError } = await supabase
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .in("account_id", rows.map((r) => r.id))
    .eq("direction", "out")
    .eq("status", "sent")
    .gte("created_at", new Date(Date.now() - DAY_MS).toISOString());
  return countError ? null : (count ?? 0);
}

function listUnsubscribe(email: string, leadId: string | null, baseUrl: string, replyAddress: string): Record<string, string> | undefined {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.AUTOMATION_SECRET || "";
  // Without a secret there is no safe link; the mailto alone still works.
  if (!secret) return { "List-Unsubscribe": `<mailto:${replyAddress}?subject=unsubscribe>` };
  return unsubscribeHeaders({ email, leadId }, baseUrl, replyAddress, secret);
}

async function downloadAttachments(files: EmailAttachment[]): Promise<OutboundFile[]> {
  if (!files.length) return [];
  const admin = createServiceRoleClient();
  if (!admin) throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY");
  const out = await Promise.all(
    files.map(async (f) => {
      const { data, error } = await admin.storage.from(ATTACHMENT_BUCKET).download(f.path);
      if (error || !data) throw new Error(`Couldn't read the attachment "${f.name}". Attach it again.`);
      return { filename: f.name, content: Buffer.from(await data.arrayBuffer()), contentType: f.type || "application/octet-stream" };
    })
  );
  // The sizes the browser reported are only a hint; the cap holds on the real bytes.
  if (out.reduce((n, f) => n + f.content.length, 0) > MAX_ATTACHMENT_BYTES) throw new Error(`Attachments add up to more than ${MAX_TOTAL_MB} MB.`);
  return out;
}

async function replyTarget(messageId: string): Promise<ReplyTarget | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data } = await admin
    .from("email_messages")
    .select("message_id_header, conversation_id, provider_thread_id, provider, account_id, lead_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!data) return null;
  return {
    messageIdHeader: data.message_id_header,
    conversationId: data.conversation_id ?? data.provider_thread_id,
    providerThreadId: data.provider_thread_id,
    provider: data.provider,
    accountId: data.account_id,
    leadId: data.lead_id,
  };
}

// Service role, not the cookie client: automation sends have no browser session.
async function headerFor(messageId: string): Promise<string | null> {
  const { data } = (await createServiceRoleClient()?.from("email_messages").select("message_id_header").eq("id", messageId).maybeSingle()) ?? {};
  return data?.message_id_header ?? null;
}

async function threadFor(messageId: string): Promise<string | null> {
  const { data } = (await createServiceRoleClient()?.from("email_messages").select("provider_thread_id").eq("id", messageId).maybeSingle()) ?? {};
  return data?.provider_thread_id ?? null;
}

/** The signature name, drawn in Michroma, as an inline (cid:) part. */
function signatureNameFile(image: NameImage): OutboundFile {
  return { filename: "name.png", content: image.png, contentType: "image/png", cid: NAME_CID };
}

/** The signature logo as an inline (cid:) part, so it never depends on loading a remote image. */
function signatureLogoFile(): OutboundFile {
  return { filename: "launch-control.png", content: Buffer.from(SIGNATURE_LOGO_PNG_BASE64, "base64"), contentType: "image/png", cid: LOGO_CID };
}
