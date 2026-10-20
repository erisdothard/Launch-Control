"use server";

import { revalidatePath } from "next/cache";
import { emailConfig } from "@/lib/email/config";
import { currentCrmUserEmail } from "@/lib/email/session";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type EmailSettingsResult = { ok: true } | { ok: false; error: string };

// Business addresses are always on the verified sending domain; only the local part is chosen.
export async function addBusinessAddressAction(localPart: string, displayName: string): Promise<EmailSettingsResult> {
  const user = await currentCrmUserEmail();
  if (!user) return { ok: false, error: "Sign in again." };
  const local = localPart.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,40}$/.test(local)) return { ok: false, error: "Use letters, numbers, dots or dashes." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server is missing its Supabase key." };
  const { error } = await admin.from("email_accounts").insert({
    provider: "resend",
    address: `${local}@${emailConfig.sendingDomain}`,
    display_name: displayName.replace(/["<>\r\n]/g, "").trim().slice(0, 80),
    connected_by: user,
  });
  if (error) return { ok: false, error: error.code === "23505" ? "That address already exists." : "Could not add it." };
  revalidatePath("/admin/settings");
  return { ok: true };
}

/** Sender name and the title shown under it in the signature. */
export async function setDisplayNameAction(accountId: string, displayName: string, signatureTitle: string): Promise<EmailSettingsResult> {
  if (!(await currentCrmUserEmail())) return { ok: false, error: "Sign in again." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server is missing its Supabase key." };
  const { error } = await admin
    .from("email_accounts")
    .update({
      display_name: displayName.replace(/["<>\r\n]/g, "").trim().slice(0, 80),
      signature_title: signatureTitle.replace(/[<>\r\n]/g, "").trim().slice(0, 120),
    })
    .eq("id", accountId);
  if (error) return { ok: false, error: "Could not save." };
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function removeEmailAccountAction(accountId: string): Promise<EmailSettingsResult> {
  if (!(await currentCrmUserEmail())) return { ok: false, error: "Sign in again." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server is missing its Supabase key." };
  // Disabled, not deleted: past messages keep their sender.
  const { error } = await admin.from("email_accounts").update({ status: "disabled" }).eq("id", accountId);
  if (error) return { ok: false, error: "Could not remove it." };
  revalidatePath("/admin/settings");
  return { ok: true };
}
