"use server";

import { revalidatePath } from "next/cache";
import { sendLeadEmail, type SendInput, type SendResult } from "@/lib/email/send";
import { markThreadRead } from "@/lib/store/messages";

function revalidateThread(leadId?: string) {
  if (leadId) revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/inbox");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/today");
}

export async function sendLeadEmailAction(input: SendInput): Promise<SendResult> {
  const result = await sendLeadEmail(input);
  revalidateThread(input.leadId);
  return result;
}

export async function markThreadReadAction(leadId: string): Promise<void> {
  await markThreadRead(leadId);
  revalidateThread();
}
