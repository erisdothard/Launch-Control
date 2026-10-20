"use server";

import { revalidatePath } from "next/cache";
import { sendLeadEmail, type SendResult } from "@/lib/email/send";
import { getDraft, markDraft, updateAutomationSettings, type AutomationSettings } from "@/lib/store/drafts";
import { getEmailAccounts, getThread } from "@/lib/store/messages";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function revalidateDrafts(leadId?: string) {
  revalidatePath("/admin/drafts");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/inbox");
  revalidatePath("/admin/dashboard");
  if (leadId) revalidatePath(`/admin/leads/${leadId}`);
}

// Send from the address the conversation is already on, so the thread stays in one mailbox;
// otherwise Outlook first (Max's real mailbox), then whatever else is connected.
async function accountFor(leadId: string): Promise<string | null> {
  const [accounts, thread] = await Promise.all([getEmailAccounts(), getThread(leadId)]);
  const active = accounts.filter((a) => a.status === "active");
  const lastOut = [...thread].reverse().find((m) => m.direction === "out" && m.accountId);
  const same = lastOut && active.find((a) => a.id === lastOut.accountId);
  if (same) return same.id;
  return (active.find((a) => a.provider === "outlook") ?? active[0])?.id ?? null;
}

export interface DraftEdits {
  subject: string;
  body: string;
}

export async function sendDraftAction(id: string, edits?: DraftEdits): Promise<SendResult> {
  const draft = await getDraft(id);
  if (!draft) return { ok: false, error: "That draft was already sent or discarded." };
  const accountId = await accountFor(draft.leadId);
  if (!accountId) return { ok: false, error: "Connect an email account in Settings first." };

  const subject = edits?.subject ?? draft.subject;
  const body = edits?.body ?? draft.body;
  const result = await sendLeadEmail({ leadId: draft.leadId, accountId, to: draft.to, subject, body });

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (result.ok) await markDraft(id, { status: "sent", sentBy: user?.email ?? undefined, subject, body });
  // A failed send stays in the queue with the reason and the edits, so it can be retried.
  else await markDraft(id, { status: "pending", error: result.error, subject, body });
  revalidateDrafts(draft.leadId);
  return result;
}

export async function discardDraftAction(id: string): Promise<void> {
  const draft = await getDraft(id);
  await markDraft(id, { status: "discarded" });
  revalidateDrafts(draft?.leadId);
}

export async function updateAutomationAction(patch: Partial<AutomationSettings>): Promise<{ ok: true } | { ok: false; error: string }> {
  if (patch.dailySendCap !== undefined && (!Number.isInteger(patch.dailySendCap) || patch.dailySendCap < 0 || patch.dailySendCap > 200)) {
    return { ok: false, error: "Daily limit must be 0 to 200." };
  }
  await updateAutomationSettings(patch);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/drafts");
  return { ok: true };
}
