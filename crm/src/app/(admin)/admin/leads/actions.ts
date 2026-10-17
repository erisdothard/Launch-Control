"use server";

import { revalidatePath } from "next/cache";
import {
  createLead,
  updateLead,
  deleteLead,
  convertLeadToCustomer,
  type LeadStatus,
  type CreateLeadInput,
} from "@/lib/store/leads";

export async function createLeadAction(input: CreateLeadInput) {
  const lead = await createLead(input);
  revalidatePath("/admin/leads");
  revalidatePath("/admin/activity");
  revalidatePath("/admin/dashboard");
  return lead;
}

export async function updateLeadStatusAction(id: string, status: LeadStatus) {
  await updateLead(id, { status });
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${id}`);
  revalidatePath("/admin/activity");
  revalidatePath("/admin/dashboard");
}

export async function updateLeadAction(id: string, patch: { businessName: string; email: string; phone: string; notes: string }) {
  await updateLead(id, patch);
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${id}`);
  revalidatePath("/admin/activity");
}

export async function deleteLeadAction(id: string) {
  await deleteLead(id);
  revalidatePath("/admin/leads");
  revalidatePath("/admin/activity");
  revalidatePath("/admin/dashboard");
}

export async function convertLeadAction(id: string) {
  const customer = await convertLeadToCustomer(id);
  revalidatePath("/admin/leads");
  revalidatePath("/admin/customers");
  revalidatePath("/admin/activity");
  revalidatePath("/admin/dashboard");
  return customer;
}
