"use server";

import { revalidatePath } from "next/cache";
import { addressList, sendEmail, validAttachment, type EmailAttachment, type SendResult } from "@/lib/email/send";
import { currentCrmUserEmail } from "@/lib/email/session";
import { syncOutlookIfDue } from "@/lib/email/outlookSync";
import { isEmail } from "@/lib/email/text";
import { createLead } from "@/lib/store/leads";
import {
  findLeadIdByEmail,
  getConversation,
  linkConversationToLead,
  searchContacts,
  setConversationArchived,
  setConversationRead,
  type ContactMatch,
} from "@/lib/store/messages";

export type ActionResult = { ok: true } | { ok: false; error: string };

const SIGN_IN = "Sign in again to do that.";

function revalidateInbox(leadId?: string | null) {
  revalidatePath("/admin/inbox");
  revalidatePath("/admin/dashboard");
  if (leadId) revalidatePath(`/admin/leads/${leadId}`);
}

// Thread keys come from the URL; they are a provider conversation id, "lead:<uuid>" or "msg:<uuid>".
function validKey(key: unknown): key is string {
  return typeof key === "string" && key.length > 0 && key.length <= 300 && !/[\r\n]/.test(key);
}

function validAttachments(raw: unknown): EmailAttachment[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 10) return null;
  const out = raw.map((a) => (typeof a === "object" && a !== null ? (a as EmailAttachment) : null));
  return out.every((a): a is EmailAttachment => a !== null && validAttachment(a))
    ? out.map((a) => ({ name: a!.name, path: a!.path, size: a!.size, type: a!.type }))
    : null;
}

export interface InboxSendInput {
  accountId: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  /** The message being answered or forwarded from (email_messages id). Forwards don't thread. */
  replyToMessageId?: string | null;
  leadId?: string | null;
  attachments?: EmailAttachment[];
  /** The "Add signature" switch; on unless turned off. */
  includeSignature?: boolean;
}

/** Compose, Reply, Reply all and Forward from the Inbox, and the lead record's thread. */
export async function sendInboxEmailAction(input: InboxSendInput): Promise<SendResult> {
  const sentBy = await currentCrmUserEmail();
  if (!sentBy) return { ok: false, error: SIGN_IN };
  if (typeof input?.accountId !== "string" || !input.accountId) return { ok: false, error: "Pick who it's from." };
  if (typeof input.to !== "string" || typeof input.subject !== "string" || typeof input.body !== "string") {
    return { ok: false, error: "Something in the form is missing. Reload and try again." };
  }
  const attachments = validAttachments(input.attachments);
  if (!attachments) return { ok: false, error: "One of the attachments isn't valid. Remove it and attach it again." };
  const result = await sendEmail({
    accountId: input.accountId,
    to: input.to,
    cc: addressList(input.cc ?? ""),
    bcc: addressList(input.bcc ?? ""),
    subject: input.subject,
    body: input.body,
    leadId: typeof input.leadId === "string" && input.leadId ? input.leadId : null,
    replyToMessageId: typeof input.replyToMessageId === "string" && input.replyToMessageId ? input.replyToMessageId : null,
    attachments,
    includeSignature: input.includeSignature !== false,
    sentBy,
  });
  revalidateInbox(input.leadId);
  if (input.leadId) revalidatePath("/admin/leads");
  return result;
}

export async function setReadAction(key: string, read: boolean): Promise<ActionResult> {
  if (!(await currentCrmUserEmail())) return { ok: false, error: SIGN_IN };
  if (!validKey(key)) return { ok: false, error: "That conversation wasn't found." };
  try {
    await setConversationRead(key, read === true);
  } catch {
    return { ok: false, error: "Couldn't update that conversation. Try again." };
  }
  revalidateInbox();
  return { ok: true };
}

export async function setArchivedAction(key: string, archived: boolean): Promise<ActionResult> {
  if (!(await currentCrmUserEmail())) return { ok: false, error: SIGN_IN };
  if (!validKey(key)) return { ok: false, error: "That conversation wasn't found." };
  try {
    await setConversationArchived(key, archived === true);
  } catch {
    return { ok: false, error: "Couldn't move that conversation. Try again." };
  }
  revalidateInbox();
  return { ok: true };
}

// Free mailboxes say nothing about the business; a company domain usually names it.
const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|mac|proton|protonmail|gmx|comcast|att|verizon|sbcglobal|bellsouth)\./i;

function guessCompany(address: string, name: string): string {
  const domain = address.split("@")[1] ?? "";
  if (domain && !FREE_MAIL.test(domain)) {
    const base = domain.split(".").slice(-2, -1)[0] ?? domain;
    return base
      .split(/[-_]/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return name.trim() || address;
}

/**
 * "Add as lead": creates a lead from the person who wrote (or reuses the one already on file for
 * that address) and files the conversation, and their other unlinked mail, under it.
 */
export async function addAsLeadAction(key: string): Promise<{ ok: true; leadId: string } | { ok: false; error: string }> {
  if (!(await currentCrmUserEmail())) return { ok: false, error: SIGN_IN };
  if (!validKey(key)) return { ok: false, error: "That conversation wasn't found." };
  try {
    const messages = await getConversation(key);
    if (!messages.length) return { ok: false, error: "That conversation wasn't found." };
    const existingLead = messages.find((m) => m.leadId)?.leadId;
    if (existingLead) return { ok: true, leadId: existingLead };
    const theirs = [...messages].reverse().find((m) => m.direction === "in");
    const address = (theirs?.fromAddress ?? addressList(messages[0].toAddress)[0] ?? "").toLowerCase();
    if (!isEmail(address)) return { ok: false, error: "There's no email address to make a lead from." };
    const name = theirs?.fromName ?? "";
    const existing = await findLeadIdByEmail(address);
    const lead =
      existing ? { id: existing } : (await createLead({
        businessName: guessCompany(address, name),
        contactName: name,
        email: address,
        phone: "",
        source: "Inbox",
        notes: "",
      }));
    await linkConversationToLead(key, lead.id, address);
    revalidateInbox(lead.id);
    revalidatePath("/admin/leads");
    return { ok: true, leadId: lead.id };
  } catch {
    return { ok: false, error: "Couldn't add them as a lead. Try again." };
  }
}

export async function searchContactsAction(q: string): Promise<ContactMatch[]> {
  if (!(await currentCrmUserEmail())) return [];
  if (typeof q !== "string") return [];
  try {
    return await searchContacts(q);
  } catch {
    return [];
  }
}

/** "Check mail" and the Inbox's once-a-minute refresh: pull from Outlook now, then reload the lists. */
export async function checkMail(): Promise<ActionResult> {
  if (!(await currentCrmUserEmail())) return { ok: false, error: SIGN_IN };
  // A short gap still stops two open tabs from syncing on top of each other.
  await syncOutlookIfDue(10_000);
  revalidateInbox();
  return { ok: true };
}
