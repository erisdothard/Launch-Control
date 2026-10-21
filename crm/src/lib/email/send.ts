import "server-only";
import { getLeadById, updateLead } from "@/lib/store/leads";
import { getThread } from "@/lib/store/messages";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { replyAddressFor } from "./config";
import { accessTokenFor, sendViaGmail } from "./gmail";
import { OutlookReconnectNeeded, sendViaOutlookSmtp, type OutboundFile } from "./outlook";
import { outlookAccessToken } from "./outlookAccount";
import { sendViaResend } from "./resend";
import { emailHtml, emailText, type SignatureInput } from "./signature";
import { isEmail } from "./text";

export interface SendInput {
  leadId: string;
  accountId: string;
  to: string;
  subject: string;
  body: string;
  /** Sign with the sending address's signature. Defaults to true. */
  includeSignature?: boolean;
}

export type SendResult = { ok: true; id?: string } | { ok: false; error: string };

export interface EmailAttachment {
  name: string;
  /** Object path in the private "email-attachments" storage bucket. */
  path: string;
  size: number;
  type: string;
}

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
}

export const ATTACHMENT_BUCKET = "email-attachments";
const MAX_BODY = 20_000;
const MAX_SUBJECT = 200;
const MAX_RECIPIENTS = 50;
// Exchange takes 35 MB a message after base64; keep well under it.
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

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
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Sign in again to send." };
  return sendAsAccount({ ...input, sentBy: user.email });
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
  if (files.reduce((n, f) => n + f.size, 0) > MAX_ATTACHMENT_BYTES) return { ok: false, error: "Attachments add up to more than 20 MB." };

  const supabase = createServiceRoleClient();
  if (!supabase) return { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" };

  const { data: account } = await supabase
    .from("email_accounts")
    .select("id, provider, address, display_name, signature_name, signature_title, signature_phone, status, mailbox")
    .eq("id", input.accountId)
    .maybeSingle();
  if (!account) return { ok: false, error: "Pick who it's from." };
  if (account.status !== "active") {
    return { ok: false, error: `${account.address} needs reconnecting in Settings before it can send.` };
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
    name: account.signature_name,
    title: account.signature_title,
    address: account.address,
    phone: account.signature_phone,
  };
  const sign = input.includeSignature !== false && Boolean(account.signature_name.trim());
  const signed = sign ? { text: emailText(body, signature), html: emailHtml(body, signature) } : { text: body, html: null };
  const toLine = to.join(", ");

  let providerMessageId: string | null = null;
  let providerThreadId: string | null = null;
  let messageIdHeader: string | null = null;
  let sendError: string | null = null;

  try {
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
        mailbox: account.mailbox ?? account.address,
        to: toLine,
        cc,
        bcc,
        subject,
        ...signed,
        attachments: outbound,
        inReplyTo,
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
      const sent = await sendViaGmail(await accessTokenFor(refreshToken), { from, to: toLine, cc, bcc, subject, ...signed, attachments: outbound, threadId, inReplyTo });
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

  const { data: stored, error: storeError } = await supabase
    .from("email_messages")
    .insert({
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
    })
    .select("id")
    .maybeSingle();

  if (sendError) return { ok: false, error: sendError };
  // Sent but not recorded: say so rather than let it look like nothing happened.
  if (storeError) return { ok: false, error: "The email went out, but the CRM couldn't save a copy. Don't send it again; it's in Outlook's Sent Items." };
  if (lead) {
    // First touch moves a new lead along the pipeline; fill in the address if the lead had none.
    const patch: Parameters<typeof updateLead>[1] = {};
    if (lead.status === "new") patch.status = "contacted";
    // Only when the address is clearly theirs: a fresh email to them, or a reply on their own thread.
    if (!lead.email && (!reply || reply.leadId === lead.id)) patch.email = to[0];
    if (Object.keys(patch).length) await updateLead(lead.id, patch, supabase);
  }
  return { ok: true, id: stored?.id };
}

/**
 * Attachments come from the composer's own upload step ("outbound/<uuid>/<name>" in the bucket);
 * refuse anything else, and any type that could smuggle a header into the MIME part.
 */
export function validAttachment(f: EmailAttachment): boolean {
  return (
    typeof f.path === "string" &&
    f.path.startsWith("outbound/") &&
    !f.path.split("/").includes("..") &&
    f.path.length < 500 &&
    typeof f.name === "string" &&
    f.name.length > 0 &&
    f.name.length <= 200 &&
    !/[\r\n]/.test(f.name) &&
    Number.isInteger(f.size) &&
    f.size >= 0 &&
    typeof f.type === "string" &&
    (f.type === "" || /^[\w.+-]+\/[\w.+-]+$/.test(f.type))
  );
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
  if (out.reduce((n, f) => n + f.content.length, 0) > MAX_ATTACHMENT_BYTES) throw new Error("Attachments add up to more than 20 MB.");
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
