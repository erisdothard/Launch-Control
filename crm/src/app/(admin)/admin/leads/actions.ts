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
  logOutsideContact,
  type OutsideContactKind,
  type ImportLeadInput,
  type ImportResult,
  type CreateLeadInput,
} from "@/lib/store/leads";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/store/types";
import { parseTemperature } from "@/lib/leads/temperature";
import { teamTodayISO } from "@/lib/leads/followUp";
import { currentCrmUserEmail } from "@/lib/email/session";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SIGN_IN = "Sign in again to do that.";
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// The database's row rules already keep anyone off the team out of these tables. This is the same
// check made here as well, so an action never depends on that alone.
async function requireTeam(): Promise<void> {
  if (!(await currentCrmUserEmail())) throw new Error(SIGN_IN);
}

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
  await requireTeam();
  if (!allowDuplicate) {
    const existing = await findDuplicateLead({ email: input.email, website: input.website, businessName: input.businessName });
    if (existing) return { ok: false, duplicate: { id: existing.id, businessName: existing.businessName } };
  }
  const lead = await createLead(input);
  revalidateLeads();
  return { ok: true, id: lead.id };
}

export async function markLeadNotAFitAction(id: string) {
  await requireTeam();
  await markLeadNotAFit(id);
  revalidateLeads(id);
}

export async function markLeadQuietAction(id: string) {
  await requireTeam();
  await markLeadQuiet(id);
  revalidateLeads(id);
}

export async function reopenLeadAction(id: string) {
  await requireTeam();
  await reopenLead(id);
  revalidateLeads(id);
}

export async function updateLeadAction(
  id: string,
  patch: { businessName: string; email: string; phone: string; notes: string; status?: LeadStatus }
) {
  await requireTeam();
  const { status } = patch;
  const details = {
    businessName: str(patch.businessName, 200),
    email: str(patch.email, 254),
    phone: str(patch.phone, 40),
    notes: typeof patch.notes === "string" ? patch.notes.slice(0, 5000) : "",
  };
  if (!details.businessName) throw new Error("The business needs a name.");
  // The status normally sets itself from what happened; a change made here is Max's own call.
  const byHand = status !== undefined && LEAD_STATUSES.includes(status) ? { status, statusReason: "Set by hand" } : {};
  await updateLead(id, { ...details, ...byHand });
  revalidateLeads(id);
}

type Result = { ok: true } | { ok: false; error: string };

/** Hot, warm or cold, set by hand. Null hands it back to the CRM to work out. */
export async function setTemperatureAction(id: string, value: string | null): Promise<Result> {
  if (!(await currentCrmUserEmail())) return { ok: false, error: SIGN_IN };
  const temperature = value === null ? null : parseTemperature(value);
  if (value !== null && temperature === null) return { ok: false, error: "Pick hot, warm or cold." };
  try {
    const lead = await updateLead(id, { temperature });
    if (!lead) return { ok: false, error: "That lead wasn't found." };
  } catch {
    return { ok: false, error: "That didn't save. Try again." };
  }
  revalidateLeads(id);
  return { ok: true };
}

const OUTSIDE_KINDS: readonly OutsideContactKind[] = ["emailed", "called", "met", "they-replied"];

/** Records an email, call or meeting that happened outside the CRM. Sends nothing. */
export async function logOutsideContactAction(id: string, input: { kind: string; on: string; note: string }): Promise<Result> {
  if (!(await currentCrmUserEmail())) return { ok: false, error: SIGN_IN };
  const kind = OUTSIDE_KINDS.find((k) => k === input?.kind);
  if (!kind) return { ok: false, error: "Pick what happened." };
  if (typeof input.on !== "string" || !ISO_DATE.test(input.on) || Number.isNaN(Date.parse(input.on))) return { ok: false, error: "Pick a valid date." };
  if (input.on > teamTodayISO()) return { ok: false, error: "That date hasn't happened yet." };
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";
  try {
    const lead = await logOutsideContact(id, { kind, on: input.on, note });
    if (!lead) return { ok: false, error: "That lead wasn't found." };
  } catch {
    return { ok: false, error: "That didn't save. Try again." };
  }
  revalidateLeads(id);
  return { ok: true };
}

export async function updateNextStepAction(
  id: string,
  nextAction: string,
  followUpOn: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await currentCrmUserEmail())) return { ok: false, error: SIGN_IN };
  if (followUpOn !== null && !ISO_DATE.test(followUpOn)) return { ok: false, error: "Pick a valid date." };
  await updateLead(id, { nextAction: nextAction.trim().slice(0, 300), followUpOn });
  revalidateLeads(id);
  return { ok: true };
}

export async function deleteLeadAction(id: string) {
  await requireTeam();
  await deleteLead(id);
  revalidateLeads();
}

export async function convertLeadAction(id: string) {
  await requireTeam();
  const customer = await convertLeadToCustomer(id);
  revalidateLeads(id);
  revalidatePath("/admin/customers");
  return customer;
}

export async function convertLeadToDealAction(id: string, value: number) {
  await requireTeam();
  const deal = await convertLeadToDeal(id, Number.isFinite(value) && value > 0 ? value : 0);
  revalidateLeads(id);
  revalidatePath("/admin/deals");
  return deal ? { ok: true as const } : { ok: false as const };
}

const MAX_IMPORT = 1000;

export async function importLeadsAction(rows: unknown, fileName: string): Promise<{ ok: true; result: ImportResult } | { ok: false; error: string }> {
  if (!(await currentCrmUserEmail())) return { ok: false, error: SIGN_IN };
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
