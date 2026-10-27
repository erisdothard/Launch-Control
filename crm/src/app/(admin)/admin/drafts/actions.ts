"use server";

import { revalidatePath } from "next/cache";
import { sendEmail, validAttachment, type EmailAttachment, type SendResult } from "@/lib/email/send";
import { currentCrmUserEmail } from "@/lib/email/session";
import { AFTER_LAST_FOLLOW_UP, claimDraft, getDraft, markDraft, updateAutomationSettings, type AutomationSettings } from "@/lib/store/drafts";
import { getEmailAccounts, getThread } from "@/lib/store/messages";

// Drafts live in the Inbox (Drafts folder); /admin/drafts only redirects there. Today imports
// these actions from here.
function revalidateDrafts(leadId?: string) {
  revalidatePath("/admin/leads");
  revalidatePath("/admin/inbox");
  revalidatePath("/admin/dashboard");
  if (leadId) revalidatePath(`/admin/leads/${leadId}`);
}

// When the screen didn't say who it's from (automation, older callers): the address the
// conversation is already on, so the thread stays put; otherwise Max's own Outlook mailbox.
async function accountFor(leadId: string): Promise<string | null> {
  const [accounts, thread] = await Promise.all([getEmailAccounts(), getThread(leadId)]);
  const active = accounts.filter((a) => a.status === "active");
  const lastOut = [...thread].reverse().find((m) => m.direction === "out" && m.accountId);
  const same = lastOut && active.find((a) => a.id === lastOut.accountId);
  if (same) return same.id;
  return (active.find((a) => a.provider === "outlook" && !a.mailbox) ?? active.find((a) => a.provider === "outlook") ?? active[0])?.id ?? null;
}

export interface DraftEdits {
  subject: string;
  body: string;
  /** From the Inbox's draft composer; each defaults to what the draft already has. */
  accountId?: string;
  to?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: EmailAttachment[];
  /** The "Add signature" switch; on unless turned off. */
  includeSignature?: boolean;
}

const isStr = (v: unknown, max: number) => typeof v === "string" && v.length <= max;

/** The edits come from the browser: check every field's type before anything is claimed. */
function validEdits(edits: DraftEdits | undefined): boolean {
  if (edits === undefined) return true;
  if (typeof edits !== "object" || edits === null) return false;
  const list = (v: unknown) => v === undefined || (Array.isArray(v) && v.length <= 50 && v.every((x) => isStr(x, 320)));
  return (
    isStr(edits.subject, 1000) &&
    isStr(edits.body, 50_000) &&
    (edits.accountId === undefined || isStr(edits.accountId, 100)) &&
    (edits.to === undefined || isStr(edits.to, 5000)) &&
    list(edits.cc) &&
    list(edits.bcc) &&
    (edits.includeSignature === undefined || typeof edits.includeSignature === "boolean") &&
    (edits.attachments === undefined ||
      (Array.isArray(edits.attachments) && edits.attachments.length <= 10 && edits.attachments.every((f) => typeof f === "object" && f !== null && validAttachment(f))))
  );
}

export async function sendDraftAction(id: string, edits?: DraftEdits): Promise<SendResult> {
  const sentBy = await currentCrmUserEmail();
  if (!sentBy) return { ok: false, error: "Sign in again to send." };
  if (!validEdits(edits)) return { ok: false, error: "Something in that draft isn't valid. Reload the page and try again." };
  const draft = await getDraft(id);
  if (!draft) return { ok: false, error: "That draft was already sent or discarded." };
  const accountId = (typeof edits?.accountId === "string" && edits.accountId) || (await accountFor(draft.leadId));
  if (!accountId) return { ok: false, error: "Connect an email account in Settings first." };

  const subject = edits?.subject ?? draft.subject;
  const body = edits?.body ?? draft.body;
  // Claimed first, so the same draft can never go out twice.
  if (!(await claimDraft(id, sentBy))) return { ok: false, error: "That draft was already sent or discarded." };
  let result: SendResult;
  try {
    result = await sendEmail({
      accountId,
      leadId: draft.leadId,
      to: edits?.to?.trim() || draft.to,
      cc: edits?.cc,
      bcc: edits?.bcc,
      attachments: edits?.attachments,
      subject,
      body,
      replyToMessageId: draft.replyToMessageId,
      includeSignature: edits?.includeSignature !== false,
      sentBy,
    });
  } catch (err) {
    // Thrown before anything went out: back in the queue, never stuck as "sent".
    result = { ok: false, error: err instanceof Error ? err.message : "Send failed. Try again." };
  }

  // ok with a warning still went out (only the CRM copy failed), so it counts as sent.
  if (result.ok) await markDraft(id, { status: "sent", sentBy, subject, body }).catch(() => undefined);
  // Someone who opted out can never be sent this: the draft is dropped with the reason.
  else if (result.code === "opted_out") await markDraft(id, { status: "discarded", error: result.error });
  // A failed send goes back in the queue with the reason and the edits, so it can be retried.
  else await markDraft(id, { status: "pending", error: result.error, subject, body });
  revalidateDrafts(draft.leadId);
  return result;
}

export async function discardDraftAction(id: string): Promise<void> {
  if (!(await currentCrmUserEmail())) throw new Error("Sign in again.");
  const draft = await getDraft(id);
  // Only a draft still waiting: one that was just sent stays sent.
  if (!draft) throw new Error("That draft was already sent or discarded.");
  await markDraft(id, { status: "discarded" }, undefined, { onlyIfPending: true });
  revalidateDrafts(draft.leadId);
}

export async function updateAutomationAction(patch: Partial<AutomationSettings>): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await currentCrmUserEmail())) return { ok: false, error: "Sign in again to change automation." };
  if (patch.autoSendFollowUps !== undefined && typeof patch.autoSendFollowUps !== "boolean") return { ok: false, error: "Pick on or off." };
  if (patch.draftReplies !== undefined && typeof patch.draftReplies !== "boolean") return { ok: false, error: "Pick on or off." };
  if (
    patch.followUpDays !== undefined &&
    (!Array.isArray(patch.followUpDays) || patch.followUpDays.length > 6 || patch.followUpDays.some((d) => !Number.isInteger(d) || d < 1 || d > 60))
  ) {
    return { ok: false, error: "Follow-up days must be 1 to 60, six at most." };
  }
  if (patch.coldAfterDays !== undefined && (!Number.isInteger(patch.coldAfterDays) || patch.coldAfterDays < 1 || patch.coldAfterDays > 60)) {
    return { ok: false, error: "Pick 1 to 60 days." };
  }
  if (patch.afterLastFollowUp !== undefined && !AFTER_LAST_FOLLOW_UP.includes(patch.afterLastFollowUp)) {
    return { ok: false, error: "Pick what happens after the last follow-up." };
  }
  if (patch.dailySendCap !== undefined && (!Number.isInteger(patch.dailySendCap) || patch.dailySendCap < 0 || patch.dailySendCap > 200)) {
    return { ok: false, error: "Daily limit must be 0 to 200." };
  }
  await updateAutomationSettings(patch);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/inbox");
  return { ok: true };
}
