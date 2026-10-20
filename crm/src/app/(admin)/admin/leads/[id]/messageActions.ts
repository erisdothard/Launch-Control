"use server";

import { revalidatePath } from "next/cache";
import { sendLeadEmail, type SendInput, type SendResult } from "@/lib/email/send";
import { markThreadRead } from "@/lib/store/messages";

export async function sendLeadEmailAction(input: SendInput): Promise<SendResult> {
  const result = await sendLeadEmail(input);
  revalidatePath(`/admin/leads/${input.leadId}`);
  revalidatePath("/admin/inbox");
  revalidatePath("/admin/leads");
  return result;
}

export async function markThreadReadAction(leadId: string): Promise<void> {
  await markThreadRead(leadId);
  revalidatePath("/admin/inbox");
}
