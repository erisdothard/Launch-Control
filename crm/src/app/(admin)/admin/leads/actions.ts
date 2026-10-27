"use server";

import { revalidatePath } from "next/cache";
import {
  createLead,
  updateLead,
  markLeadNotAFit,
  markLeadQuiet,
  reopenLead,
  deleteLead,
  convertLeadToCustomer,
  convertLeadToDeal,
  findDuplicateLead,
  importLeads,
  type ImportLeadInput,
  type ImportResult,
  type CreateLeadInput,
} from "@/lib/store/leads";

function revalidateLeads(id?: string) {
  revalidatePath("/admin/leads");
  if (id) revalidatePath(`/admin/leads/${id}`);
  revalidatePath("/admin/activity");
  revalidatePath("/admin/dashboard");
}

export type CreateLeadResult =
  | { ok: true; id: string }
  | { ok: false; duplicate: { id: string; businessName: string } };

// Refuses a lead that's already in the CRM (same email, website or business name) unless the
// caller says to add it anyway, so nobody gets cold-emailed twice from two records.
export async function createLeadAction(input: CreateLeadInput, allowDuplicate = false): Promise<CreateLeadResult> {
  if (!allowDuplicate) {
    const existing = await findDuplicateLead({ email: input.email, website: input.website, businessName: input.businessName });
    if (existing) return { ok: false, duplicate: { id: existing.id, businessName: existing.businessName } };
  }
  const lead = await createLead(input);
  revalidateLeads();
  return { ok: true, id: lead.id };
}

export async function markLeadNotAFitAction(id: string) {
  await markLeadNotAFit(id);
  revalidateLeads(id);
}

export async function markLeadQuietAction(id: string) {
  await markLeadQuiet(id);
  revalidateLeads(id);
}

export async function reopenLeadAction(id: string) {
  await reopenLead(id);
  revalidateLeads(id);
}

export async function updateLeadAction(id: string, patch: { businessName: string; email: string; phone: string; notes: string }) {
  await updateLead(id, patch);
  revalidateLeads(id);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function updateNextStepAction(
  id: string,
  nextAction: string,
  followUpOn: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (followUpOn !== null && !ISO_DATE.test(followUpOn)) return { ok: false, error: "Pick a valid date." };
  await updateLead(id, { nextAction: nextAction.trim().slice(0, 300), followUpOn });
  revalidateLeads(id);
  return { ok: true };
}

export async function deleteLeadAction(id: string) {
  await deleteLead(id);
  revalidateLeads();
}

export async function convertLeadAction(id: string) {
  const customer = await convertLeadToCustomer(id);
  revalidateLeads(id);
  revalidatePath("/admin/customers");
  return customer;
}

export async function convertLeadToDealAction(id: string, value: number) {
  const deal = await convertLeadToDeal(id, Number.isFinite(value) && value > 0 ? value : 0);
  revalidateLeads(id);
  revalidatePath("/admin/deals");
  return deal ? { ok: true as const } : { ok: false as const };
}

const MAX_IMPORT = 1000;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function importLeadsAction(rows: unknown, fileName: string): Promise<{ ok: true; result: ImportResult } | { ok: false; error: string }> {
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "No rows to import." };
  if (rows.length > MAX_IMPORT) return { ok: false, error: `Up to ${MAX_IMPORT} rows at a time.` };
  const clean: ImportLeadInput[] = rows
    .map((r) => {
      const o = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
      return {
        businessName: str(o.businessName, 200),
        email: str(o.email, 254),
        phone: str(o.phone, 40),
        website: str(o.website, 300),
        contactName: str(o.contactName, 120),
        notes: str(o.notes, 5000),
      };
    })
    .filter((r) => r.businessName);
  const source = `Import: ${str(fileName, 80) || "spreadsheet"}`;
  try {
    const result = await importLeads(clean, source);
    revalidateLeads();
    return { ok: true, result };
  } catch {
    return { ok: false, error: "Import failed and nothing was saved. Try again." };
  }
}
