"use server";

import { revalidatePath } from "next/cache";
import { updateLead } from "@/lib/store/leads";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/store/types";

export async function setProspectStatusAction(id: string, status: LeadStatus) {
  if (!LEAD_STATUSES.includes(status)) throw new Error(`Unknown status: ${status}`);
  await updateLead(id, { status });
  revalidatePath("/admin/lead-gen");
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${id}`);
  revalidatePath("/admin/activity");
  revalidatePath("/admin/dashboard");
}
