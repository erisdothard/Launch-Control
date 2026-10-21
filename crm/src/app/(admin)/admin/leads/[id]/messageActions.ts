"use server";

import { revalidatePath } from "next/cache";
import { sendLeadEmail, type SendInput, type SendResult } from "@/lib/email/send";
import { currentCrmUserEmail } from "@/lib/email/session";
import { markThreadRead } from "@/lib/store/messages";

export async function sendLeadEmailAction(input: SendInput): Promise<SendResult> {
  // sendLeadEmail checks the team allowlist too; checked here first so nothing else runs for a stranger.
  if (!(await currentCrmUserEmail())) return { ok: false, error: "Sign in again to send." };
  const result = await sendLeadEmail(input);
  revalidatePath(`/admin/leads/${input.leadId}`);
  revalidatePath("/admin/inbox");
  revalidatePath("/admin/leads");
  return result;
}

export async function markThreadReadAction(leadId: string): Promise<void> {
  if (!(await currentCrmUserEmail())) throw new Error("Sign in again.");
  await markThreadRead(leadId);
  revalidatePath("/admin/inbox");
}
