import { getStoreClient, type StoreClient } from "./db";
import type { ContactFilterKey } from "@/lib/leads/contactFilter";
import { logActivity } from "./activity";
import { createCustomer, type Customer } from "./customers";
import type { Lead, LeadStatus, Prospect, ScoreFactor } from "./types";

export type { Lead, LeadStatus } from "./types";
export { LEAD_STATUSES } from "./types";

interface LeadRow {
  id: string;
  business_name: string;
  email: string;
  phone: string;
  status: LeadStatus;
  source: string;
  notes: string;
  created_at: string;
  segment: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  domain: string | null;
  contact_name: string | null;
  contact_title: string | null;
  score: number | null;
  score_breakdown: unknown;
  score_reason: string | null;
  outreach_hook: string | null;
  signals: unknown;
  run_id: string | null;
  scored_at: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// jsonb arrives untyped; keep only well-formed factors so a bad row can't break the page.
function toBreakdown(value: unknown): Record<string, ScoreFactor> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, ScoreFactor> = {};
  for (const [key, factor] of Object.entries(value)) {
    if (isRecord(factor) && typeof factor.rating === "number") {
      out[key] = { rating: factor.rating, evidence: typeof factor.evidence === "string" ? factor.evidence : "" };
    }
  }
  return out;
}

function rowToProspect(row: LeadRow): Prospect | null {
  if (row.domain === null && row.score === null && row.website === null) return null;
  return {
    segment: row.segment,
    city: row.city,
    state: row.state,
    website: row.website,
    domain: row.domain,
    contactName: row.contact_name,
    contactTitle: row.contact_title,
    score: row.score,
    scoreBreakdown: toBreakdown(row.score_breakdown),
    scoreReason: row.score_reason,
    outreachHook: row.outreach_hook,
    signals: isRecord(row.signals) ? row.signals : null,
    runId: row.run_id,
    scoredAt: row.scored_at,
  };
}

function rowToLead(row: LeadRow): Lead {
  return {
    id: row.id,
    businessName: row.business_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    source: row.source,
    notes: row.notes,
    createdAt: row.created_at,
    prospect: rowToProspect(row),
  };
}

export interface GetLeadsParams {
  status?: LeadStatus;
  search?: string;
  source?: string;
  segment?: string;
  state?: string;
  minScore?: number;
  sortByScore?: boolean;
  has?: ContactFilterKey[];
}

export async function getLeads(params?: GetLeadsParams, client?: StoreClient): Promise<Lead[]> {
  const supabase = await getStoreClient(client);
  let query = supabase.from("leads").select("*");
  query = params?.sortByScore
    ? query.order("score", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false })
    : query.order("created_at", { ascending: false });

  if (params?.source) query = query.eq("source", params.source);
  if (params?.segment) query = query.eq("segment", params.segment);
  if (params?.state) query = query.eq("state", params.state);
  if (params?.minScore !== undefined) query = query.gte("score", params.minScore);
  if (params?.status) {
    query = query.eq("status", params.status);
  }
  // email/phone are NOT NULL with '' for "none"; contact_name/website are nullable.
  for (const field of params?.has ?? []) {
    if (field === "email") query = query.neq("email", "");
    if (field === "phone") query = query.neq("phone", "");
    if (field === "contact") query = query.not("contact_name", "is", null).neq("contact_name", "");
    if (field === "website") query = query.not("website", "is", null).neq("website", "");
  }
  if (params?.search) {
    // Strip characters that would break out of PostgREST's or() filter syntax.
    const term = params.search.trim().replace(/[,()*%\\]/g, " ");
    if (term) {
      query = query.or(
        `business_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,contact_name.ilike.%${term}%,domain.ilike.%${term}%`
      );
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as LeadRow[]).map(rowToLead);
}

export async function getLeadById(id: string, client?: StoreClient): Promise<Lead | null> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return data ? rowToLead(data as LeadRow) : null;
}

export interface CreateLeadInput {
  businessName: string;
  email: string;
  phone: string;
  source: string;
  notes: string;
  status?: LeadStatus;
}

export async function createLead(input: CreateLeadInput, client?: StoreClient): Promise<Lead> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("leads")
    .insert({
      business_name: input.businessName,
      email: input.email,
      phone: input.phone,
      source: input.source || "Manual entry",
      notes: input.notes,
      status: input.status ?? "new",
    })
    .select()
    .single();

  if (error) throw error;
  const lead = rowToLead(data as LeadRow);

  await logActivity(
    { entityType: "lead", entityId: lead.id, entityLabel: lead.businessName, action: "created" },
    client
  );

  return lead;
}

export async function updateLead(
  id: string,
  patch: Partial<Omit<Lead, "id" | "createdAt" | "prospect">>,
  client?: StoreClient
): Promise<Lead | null> {
  const supabase = await getStoreClient(client);
  const existing = await getLeadById(id, supabase);
  if (!existing) return null;

  const statusChanged = patch.status !== undefined && patch.status !== existing.status;

  const { data, error } = await supabase
    .from("leads")
    .update({
      ...(patch.businessName !== undefined && { business_name: patch.businessName }),
      ...(patch.email !== undefined && { email: patch.email }),
      ...(patch.phone !== undefined && { phone: patch.phone }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.source !== undefined && { source: patch.source }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  const lead = rowToLead(data as LeadRow);

  await logActivity(
    {
      entityType: "lead",
      entityId: id,
      entityLabel: lead.businessName,
      action: statusChanged ? "status_changed" : "updated",
      detail: statusChanged ? `→ ${patch.status}` : undefined,
    },
    client
  );

  return lead;
}

export async function deleteLead(id: string, client?: StoreClient): Promise<boolean> {
  const supabase = await getStoreClient(client);
  const lead = await getLeadById(id, supabase);
  if (!lead) return false;

  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw error;

  await logActivity({ entityType: "lead", entityId: id, entityLabel: lead.businessName, action: "deleted" }, client);

  return true;
}

export async function convertLeadToCustomer(id: string, client?: StoreClient): Promise<Customer | null> {
  const supabase = await getStoreClient(client);
  const lead = await getLeadById(id, supabase);
  if (!lead) return null;

  const customer = await createCustomer(
    { businessName: lead.businessName, email: lead.email, phone: lead.phone, notes: lead.notes, fromLeadId: lead.id },
    supabase
  );

  await updateLead(id, { status: "converted" }, supabase);

  await logActivity(
    { entityType: "lead", entityId: id, entityLabel: lead.businessName, action: "converted", detail: `→ customer ${customer.id}` },
    supabase
  );
  await logActivity(
    { entityType: "customer", entityId: customer.id, entityLabel: customer.businessName, action: "created", detail: `from lead ${id}` },
    supabase
  );

  return customer;
}
