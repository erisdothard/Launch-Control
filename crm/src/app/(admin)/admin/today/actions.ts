"use server";

import { revalidatePath } from "next/cache";
import type { SendResult } from "@/lib/email/send";
import { isEmail } from "@/lib/email/text";
import { getLeadById } from "@/lib/store/leads";
import { getDraft } from "@/lib/store/drafts";
import { getThread, markThreadRead } from "@/lib/store/messages";
import { accountFor } from "@/lib/today/account";
import { sendDraftAction } from "../drafts/actions";
import { sendLeadEmailAction } from "../leads/[id]/messageActions";

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_BODY = 20_000;
const REPLY_PREFIX = /^\s*(re|fwd?)\s*:\s*/i;

function replySubject(subject: string, fallback: string): string {
  let base = subject.trim();
  while (REPLY_PREFIX.test(base)) base = base.replace(REPLY_PREFIX, "");
  return `Re: ${base || fallback}`.slice(0, 200);
}

export interface ReplyInput {
  leadId: string;
  /** The pending AI draft the reply box was pre-filled from, when there was one. */
  draftId: string | null;
  body: string;
}

/**
 * Sends Max's reply to a lead from the Today page. The client only supplies the words: the mailbox,
 * the To address and the subject ("Re: whatever they wrote") are worked out here. A reply means the
 * thread has been read, so it is marked read on success and the card leaves the queue.
 */
export async function sendReplyAction(input: ReplyInput): Promise<SendResult> {
  if (!UUID.test(input.leadId)) return { ok: false, error: "That lead could not be found." };
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body) return { ok: false, error: "Write something first." };
  if (body.length > MAX_BODY) return { ok: false, error: "That message is too long." };

  const result = await (input.draftId ? sendViaDraft(input.leadId, input.draftId, body) : sendFresh(input.leadId, body));
  if (result.ok) await markThreadRead(input.leadId);
  revalidatePath("/admin/today");
  revalidatePath(`/admin/leads/${input.leadId}`);
  return result;
}

async function sendViaDraft(leadId: string, draftId: string, body: string): Promise<SendResult> {
  const draft = UUID.test(draftId) ? await getDraft(draftId) : null;
  // The draft may have been sent or discarded elsewhere since the page loaded; send the words anyway.
  if (!draft || draft.leadId !== leadId) return sendFresh(leadId, body);
  return sendDraftAction(draft.id, { subject: draft.subject, body });
}

async function sendFresh(leadId: string, body: string): Promise<SendResult> {
  const lead = await getLeadById(leadId);
  if (!lead) return { ok: false, error: "That lead could not be found." };
  if (!isEmail(lead.email)) return { ok: false, error: "This lead has no email address on file." };
  const [accountId, thread] = await Promise.all([accountFor(leadId), getThread(leadId)]);
  if (!accountId) return { ok: false, error: "Connect an email account in Settings first." };
  const last = thread[thread.length - 1];
  const subject = replySubject(last?.subject ?? "", lead.businessName);
  return sendLeadEmailAction({ leadId, accountId, to: lead.email, subject, body });
}
