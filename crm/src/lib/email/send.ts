import "server-only";
import { getLeadById, updateLead } from "@/lib/store/leads";
import { getThread } from "@/lib/store/messages";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { replyAddressFor } from "./config";
import { accessTokenFor, sendViaGmail } from "./gmail";
import { OutlookReconnectNeeded, sendViaOutlookSmtp } from "./outlook";
import { outlookAccessToken } from "./outlookAccount";
import { sendViaResend } from "./resend";
import { emailHtml, signatureText } from "./signature";
import { isEmail } from "./text";

export interface SendInput {
  leadId: string;
  accountId: string;
  to: string;
  subject: string;
  body: string;
}

export type SendResult = { ok: true } | { ok: false; error: string };

const MAX_BODY = 20_000;
const MAX_SUBJECT = 200;

function formatFrom(displayName: string, address: string): string {
  const name = displayName.replace(/["<>\r\n]/g, "").trim();
  return name ? `${name} <${address}>` : address;
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
 * Sends and records an email without a browser session, for follow-ups and drafts sent by the
 * worker or a server action. Runs with the service role; callers are responsible for authorizing.
 */
export async function sendAsAccount(input: SendAsAccountInput): Promise<SendResult> {
  const to = input.to.trim();
  const subject = input.subject.replace(/[\r\n]+/g, " ").trim().slice(0, MAX_SUBJECT);
  const body = input.body.trim();
  if (!isEmail(to)) return { ok: false, error: "Enter a valid email address." };
  if (!subject) return { ok: false, error: "Add a subject." };
  if (!body) return { ok: false, error: "Write a message first." };
  if (body.length > MAX_BODY) return { ok: false, error: "That message is too long." };

  const supabase = createServiceRoleClient();
  if (!supabase) return { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" };

  const [lead, thread, accountRes] = await Promise.all([
    getLeadById(input.leadId, supabase),
    getThread(input.leadId, supabase),
    supabase.from("email_accounts").select("id, provider, address, display_name, signature_title, status, mailbox").eq("id", input.accountId).maybeSingle(),
  ]);
  const account = accountRes.data;
  if (!lead) return { ok: false, error: "That lead no longer exists." };
  if (!account || account.status !== "active") return { ok: false, error: "Pick an active sending address." };

  // Thread the reply onto the last message the other side sent, when there is one.
  const lastInbound = [...thread].reverse().find((m) => m.direction === "in");
  const from = formatFrom(account.display_name, account.address);
  // The house signature goes under every email from an address with a sender name.
  const signature = { name: account.display_name, title: account.signature_title, address: account.address };
  const signed = account.display_name.trim()
    ? { text: `${body}\n\n${signatureText(signature)}`, html: emailHtml(body, signature) }
    : { text: body, html: null };

  let providerMessageId: string | null = null;
  let providerThreadId: string | null = null;
  let messageIdHeader: string | null = null;
  let sendError: string | null = null;

  try {
    if (account.provider === "resend") {
      const inReplyTo = lastInbound ? await headerFor(lastInbound.id) : null;
      const sent = await sendViaResend({ from, to, subject, ...signed, replyTo: replyAddressFor(lead.id), inReplyTo });
      providerMessageId = sent.id;
    } else if (account.provider === "outlook") {
      // Thread under the recipient's own last message; bounce notices and other system mail don't count.
      const lastFromThem = [...thread].reverse().find((m) => m.direction === "in" && m.fromAddress.toLowerCase() === to.toLowerCase());
      const inReplyTo = lastFromThem ? await headerFor(lastFromThem.id) : null;
      const sent = await sendViaOutlookSmtp(await outlookAccessToken(account.id, "smtp"), {
        fromName: account.display_name,
        fromAddress: account.address,
        mailbox: account.mailbox ?? account.address,
        to,
        subject,
        ...signed,
        inReplyTo,
      });
      // The worker's Sent Items sync fills in the Graph ids later, matched on this Message-ID.
      messageIdHeader = sent.messageId;
    } else {
      const admin = createServiceRoleClient();
      if (!admin) throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY");
      const { data: refreshToken } = await admin.rpc("gmail_refresh_token", { p_account_id: account.id });
      if (!refreshToken) throw new Error("This Gmail needs reconnecting in Settings");
      const lastGmail = [...thread].reverse().find((m) => m.provider === "gmail" && m.accountId === account.id);
      const threadId = lastGmail ? await threadFor(lastGmail.id) : null;
      const inReplyTo = lastInbound ? await headerFor(lastInbound.id) : null;
      const sent = await sendViaGmail(await accessTokenFor(refreshToken), { from, to, subject, ...signed, threadId, inReplyTo });
      providerMessageId = sent.id;
      providerThreadId = sent.threadId;
      messageIdHeader = sent.messageId;
    }
  } catch (err) {
    sendError = err instanceof OutlookReconnectNeeded ? err.message : err instanceof Error ? err.message : "Send failed";
    if (/invalid_grant/i.test(sendError)) {
      await createServiceRoleClient()?.from("email_accounts").update({ status: "needs_reconnect" }).eq("id", account.id);
      sendError = "This Gmail connection expired. Reconnect it in Settings.";
    }
  }

  await supabase.from("email_messages").insert({
    lead_id: lead.id,
    account_id: account.id,
    direction: "out",
    from_address: account.address,
    to_address: to,
    subject,
    body_text: body,
    provider: account.provider,
    provider_message_id: providerMessageId,
    provider_thread_id: providerThreadId,
    message_id_header: messageIdHeader,
    sent_by: input.sentBy,
    status: sendError ? "failed" : "sent",
    error: sendError,
  });

  if (sendError) return { ok: false, error: sendError };
  // First touch moves a new lead along the pipeline; fill in the address if the lead had none.
  const patch: Parameters<typeof updateLead>[1] = {};
  if (lead.status === "new") patch.status = "contacted";
  if (!lead.email) patch.email = to;
  if (Object.keys(patch).length) await updateLead(lead.id, patch, supabase);
  return { ok: true };
}

async function headerFor(messageId: string): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("email_messages").select("message_id_header").eq("id", messageId).maybeSingle();
  return data?.message_id_header ?? null;
}

async function threadFor(messageId: string): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("email_messages").select("provider_thread_id").eq("id", messageId).maybeSingle();
  return data?.provider_thread_id ?? null;
}
