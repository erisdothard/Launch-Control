import { getStoreClient, type StoreClient } from "./db";
import type { Database } from "@/lib/supabase/types";
import type { ContactFilterKey } from "@/lib/leads/contactFilter";
import { logActivity } from "./activity";
import { createCustomer, type Customer } from "./customers";
import { createDeal, type Deal } from "./deals";
import { LEAD_VIEWS, matchesView, type Awaiting, type Lead, type LeadStatus, type LeadView, type Prospect, type ScoreFactor } from "./types";

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
  next_action: string;
  follow_up_on: string | null;
  last_contacted_at: string | null;
  last_reply_at: string | null;
  status_reason: string;
  status_changed_at: string | null;
  awaiting: string | null;
  do_not_contact: boolean;
  follow_up_count: number;
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
    nextAction: row.next_action,
    followUpOn: row.follow_up_on,
    lastContactedAt: row.last_contacted_at,
    lastReplyAt: row.last_reply_at,
    statusReason: row.status_reason ?? "",
    statusChangedAt: row.status_changed_at,
    awaiting: row.awaiting === "us" || row.awaiting === "them" ? (row.awaiting as Awaiting) : null,
    doNotContact: row.do_not_contact ?? false,
    followUpCount: row.follow_up_count ?? 0,
    prospect: rowToProspect(row),
  };
}

export interface GetLeadsParams {
  status?: LeadStatus;
  view?: LeadView;
  /** Team-local YYYY-MM-DD, for the "Follow-up due" view. */
  today?: string;
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
  const leads = (data as LeadRow[]).map(rowToLead);
  const view = params?.view;
  if (!view || view === "all") return leads;
  const today = params?.today ?? new Date().toISOString().slice(0, 10);
  return leads.filter((lead) => matchesView(lead, view, today));
}

/** How many leads each view holds, for the tab counts. One read of the whole table. */
export async function getLeadViewCounts(today: string, client?: StoreClient): Promise<Record<LeadView, number>> {
  const leads = await getLeads(undefined, client);
  const counts = Object.fromEntries(LEAD_VIEWS.map((v) => [v.key, 0])) as Record<LeadView, number>;
  for (const lead of leads) for (const v of LEAD_VIEWS) if (matchesView(lead, v.key, today)) counts[v.key] += 1;
  return counts;
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
  website?: string;
  contactName?: string;
}

// "acme.com" from "https://www.acme.com/contact"; null when it isn't a usable URL.
export function domainOf(website: string): string | null {
  const raw = website.trim();
  if (!raw) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function normalName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface DuplicateKeys {
  email?: string;
  website?: string;
  businessName?: string;
}

// The lead already in the CRM for this email, website domain or exact business name, if any.
// One query per key; called once per add, and the import batches its own lookup.
export async function findDuplicateLead(keys: DuplicateKeys, client?: StoreClient): Promise<Lead | null> {
  const supabase = await getStoreClient(client);
  const email = keys.email?.trim().toLowerCase();
  const domain = keys.website ? domainOf(keys.website) : null;
  const name = keys.businessName ? normalName(keys.businessName) : "";

  if (email) {
    const { data, error } = await supabase.from("leads").select("*").ilike("email", email).limit(1);
    if (error) throw error;
    if (data?.length) return rowToLead(data[0] as LeadRow);
  }
  if (domain) {
    const { data, error } = await supabase.from("leads").select("*").eq("domain", domain).limit(1);
    if (error) throw error;
    if (data?.length) return rowToLead(data[0] as LeadRow);
  }
  if (name) {
    // ilike without wildcards is a case-insensitive equals; escape the wildcard characters.
    const term = keys.businessName!.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
    const { data, error } = await supabase.from("leads").select("*").ilike("business_name", term);
    if (error) throw error;
    const match = (data as LeadRow[]).find((r) => normalName(r.business_name) === name);
    if (match) return rowToLead(match);
  }
  return null;
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
      ...(input.website?.trim() && { website: input.website.trim(), domain: domainOf(input.website) }),
      ...(input.contactName?.trim() && { contact_name: input.contactName.trim() }),
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
  patch: Partial<Omit<Lead, "id" | "createdAt" | "prospect" | "lastContactedAt">>,
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
      ...(patch.nextAction !== undefined && { next_action: patch.nextAction }),
      ...(patch.followUpOn !== undefined && { follow_up_on: patch.followUpOn }),
      ...(patch.statusReason !== undefined && { status_reason: patch.statusReason }),
      ...(patch.awaiting !== undefined && { awaiting: patch.awaiting }),
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

// The one status a person sets: a judgment call no event can make. Stops follow-ups too.
export async function markLeadNotAFit(id: string, client?: StoreClient): Promise<Lead | null> {
  return updateLead(id, { status: "lost", statusReason: "Not a fit", awaiting: null, followUpOn: null, nextAction: "" }, client);
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

// Lead -> deal: opens a deal at "proposal" carrying the lead's name and notes, and moves the lead
// to "proposal" so the two pipelines agree. The lead stays a lead until it becomes a customer.
export async function convertLeadToDeal(id: string, value: number, client?: StoreClient): Promise<Deal | null> {
  const supabase = await getStoreClient(client);
  const lead = await getLeadById(id, supabase);
  if (!lead) return null;

  const deal = await createDeal(
    { businessName: lead.businessName, value, notes: lead.notes, fromLeadId: lead.id, stage: "proposal" },
    supabase
  );
  // The deals trigger moves the lead to "proposal" (supabase/migrations/20261019000005).
  await logActivity(
    { entityType: "lead", entityId: id, entityLabel: lead.businessName, action: "converted", detail: "→ deal" },
    supabase
  );
  return deal;
}

export interface ImportLeadInput {
  businessName: string;
  email: string;
  phone: string;
  website: string;
  contactName: string;
  notes: string;
}

export interface ImportResult {
  added: number;
  duplicates: { businessName: string; matches: string }[];
}

// Bulk add from a spreadsheet. Skips any row matching a lead already in the CRM, or an earlier row
// in the same file, by email, website domain or business name.
export async function importLeads(rows: ImportLeadInput[], source: string, client?: StoreClient): Promise<ImportResult> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("leads").select("business_name, email, domain");
  if (error) throw error;

  const byEmail = new Map<string, string>();
  const byDomain = new Map<string, string>();
  const byName = new Map<string, string>();
  const remember = (name: string, email: string, domain: string | null) => {
    if (email) byEmail.set(email.toLowerCase(), name);
    if (domain) byDomain.set(domain, name);
    byName.set(normalName(name), name);
  };
  for (const r of data ?? []) remember(r.business_name, r.email, r.domain);

  const duplicates: ImportResult["duplicates"] = [];
  const inserts: Database["public"]["Tables"]["leads"]["Insert"][] = [];
  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    const domain = domainOf(row.website);
    const match =
      (email && byEmail.get(email)) || (domain && byDomain.get(domain)) || byName.get(normalName(row.businessName));
    if (match) {
      duplicates.push({ businessName: row.businessName, matches: match });
      continue;
    }
    remember(row.businessName, email, domain);
    inserts.push({
      business_name: row.businessName.slice(0, 200),
      email,
      phone: row.phone.slice(0, 40),
      notes: row.notes.slice(0, 5000),
      source,
      status: "new",
      ...(row.website.trim() && { website: row.website.trim(), domain }),
      ...(row.contactName.trim() && { contact_name: row.contactName.trim().slice(0, 120) }),
    });
  }

  if (inserts.length) {
    const { error: insertError } = await supabase.from("leads").insert(inserts);
    if (insertError) throw insertError;
    await logActivity(
      { entityType: "lead", entityId: "import", entityLabel: `${inserts.length} leads`, action: "created", detail: `imported from ${source}` },
      client
    );
  }
  return { added: inserts.length, duplicates };
}
