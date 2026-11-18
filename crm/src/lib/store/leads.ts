import { getStoreClient, type StoreClient } from "./db";
import type { Database } from "@/lib/supabase/types";
import type { ContactFilterKey } from "@/lib/leads/contactFilter";
import { logActivity } from "./activity";
import { createCustomer, type Customer } from "./customers";
import { createDeal, type Deal } from "./deals";
import { parseTemperature, temperatureOf, type Temperature } from "@/lib/leads/temperature";
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
  follow_up_soft?: boolean;
  last_contacted_at: string | null;
  last_reply_at: string | null;
  status_reason: string;
  status_changed_at: string | null;
  awaiting: string | null;
  temperature?: string | null;
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
  score_breakdown?: unknown;
  score_reason?: string | null;
  outreach_hook?: string | null;
  signals?: unknown;
  /** The list read pulls just this flag out of signals instead of the whole object. */
  call_list?: unknown;
  run_id: string | null;
  scored_at: string | null;
}

// What a list of leads needs. The scorer's working (score_breakdown, signals, score_reason,
// outreach_hook) is about 3 KB a lead and only the record and the lead-gen page show it, so every
// other page leaves it behind: the whole table is read on most screens.
const LIST_COLUMNS =
  "id, business_name, email, phone, status, source, notes, created_at, next_action, follow_up_on, follow_up_soft, " +
  "last_contacted_at, last_reply_at, status_reason, status_changed_at, awaiting, temperature, do_not_contact, follow_up_count, " +
  "segment, city, state, website, domain, contact_name, contact_title, score, run_id, scored_at, call_list:signals->call_list";

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
    scoreReason: row.score_reason ?? null,
    outreachHook: row.outreach_hook ?? null,
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
    followUpSoft: row.follow_up_soft === true,
    lastContactedAt: row.last_contacted_at,
    lastReplyAt: row.last_reply_at,
    statusReason: row.status_reason ?? "",
    statusChangedAt: row.status_changed_at,
    awaiting: row.awaiting === "us" || row.awaiting === "them" ? (row.awaiting as Awaiting) : null,
    temperature: parseTemperature(row.temperature),
    doNotContact: row.do_not_contact ?? false,
    callList: row.call_list === true || (isRecord(row.signals) && row.signals.call_list === true),
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
  /** Hot, warm or cold: Max's own setting, or the CRM's reading when he hasn't set one. */
  temperature?: Temperature;
  /** Also read the scorer's working (breakdown, signals, reason, hook). Off by default: it is most of the weight. */
  detail?: boolean;
}

export async function getLeads(params?: GetLeadsParams, client?: StoreClient): Promise<Lead[]> {
  const supabase = await getStoreClient(client);
  // PostgREST caps a response at 1000 rows, so read every page; the builder is rebuilt per page.
  const out: LeadRow[] = [];
  for (let from = 0; ; from += LEADS_PAGE) {
    const { data, error } = await leadsQuery(supabase, params).order("id", { ascending: true }).range(from, from + LEADS_PAGE - 1);
    if (error) throw error;
    out.push(...(data as unknown as LeadRow[]));
    if (data.length < LEADS_PAGE) break;
  }
  const all = out.map(rowToLead);
  const temperature = params?.temperature;
  const leads = temperature ? all.filter((lead) => temperatureOf(lead) === temperature) : all;
  const view = params?.view;
  if (!view || view === "all") return leads;
  const today = params?.today ?? new Date().toISOString().slice(0, 10);
  return leads.filter((lead) => matchesView(lead, view, today));
}

const LEADS_PAGE = 1000;

function leadsQuery(supabase: Awaited<ReturnType<typeof getStoreClient>>, params?: GetLeadsParams) {
  let query = supabase.from("leads").select(params?.detail ? "*" : LIST_COLUMNS);
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

  return query;
}

function countViews(leads: Lead[], today: string): Record<LeadView, number> {
  const counts = Object.fromEntries(LEAD_VIEWS.map((v) => [v.key, 0])) as Record<LeadView, number>;
  for (const lead of leads) for (const v of LEAD_VIEWS) if (matchesView(lead, v.key, today)) counts[v.key] += 1;
  return counts;
}

/** How many leads each view holds, for the tab counts. One read of the whole table. */
export async function getLeadViewCounts(today: string, client?: StoreClient): Promise<Record<LeadView, number>> {
  return countViews(await getLeads(undefined, client), today);
}

/**
 * The Leads page in one go: the tab counts (always over every lead) and the leads in a view. With
 * no search or contact filter both come from a single read of the table; `pickView` chooses the
 * view once the counts are known (the page opens on the first view that has work in it).
 */
export async function getLeadsPage(
  today: string,
  filters: Pick<GetLeadsParams, "search" | "has" | "temperature">,
  pickView: (counts: Record<LeadView, number>) => LeadView,
  client?: StoreClient
): Promise<{ counts: Record<LeadView, number>; view: LeadView; leads: Lead[] }> {
  const narrowed = Boolean(filters.search) || Boolean(filters.has?.length);
  const [everyone, matching] = await Promise.all([getLeads(undefined, client), narrowed ? getLeads({ search: filters.search, has: filters.has }, client) : null]);
  const counts = countViews(everyone, today);
  const view = pickView(counts);
  const temperature = filters.temperature;
  const leads = (matching ?? everyone).filter((lead) => (!temperature || temperatureOf(lead) === temperature) && matchesView(lead, view, today));
  return { counts, view, leads };
}

export async function getLeadById(id: string, client?: StoreClient): Promise<Lead | null> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return data ? rowToLead(data as LeadRow) : null;
}

/** Several leads by id in one read (the pipeline joins each deal to the lead it came from). */
export async function getLeadsByIds(ids: string[], client?: StoreClient): Promise<Lead[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("leads").select("*").in("id", unique);

  if (error) throw error;
  return (data as LeadRow[]).map(rowToLead);
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
      // A date set here (by Max, or by a status change) is a full reminder, never the soft automatic kind.
      ...(patch.followUpOn !== undefined && { follow_up_on: patch.followUpOn, follow_up_soft: false }),
      ...(patch.statusReason !== undefined && { status_reason: patch.statusReason }),
      ...(patch.awaiting !== undefined && { awaiting: patch.awaiting }),
      ...(patch.temperature !== undefined && { temperature: patch.temperature }),
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

export type OutsideContactKind = "emailed" | "called" | "met" | "they-replied";

export interface OutsideContactInput {
  kind: OutsideContactKind;
  /** The day it happened, YYYY-MM-DD in team time. */
  on: string;
  note: string;
}

const OUTSIDE_WORDS: Record<OutsideContactKind, string> = {
  emailed: "Emailed them outside the CRM",
  called: "Called them",
  met: "Met with them",
  "they-replied": "They got back to me outside the CRM",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The dated line an outside contact adds to the lead's notes: "Nov 12: Called them. Wants pricing." */
export function outsideContactLine(input: OutsideContactInput): string {
  const [, m, d] = input.on.split("-").map(Number);
  const note = input.note.trim();
  return `${MONTHS[m - 1]} ${d}: ${OUTSIDE_WORDS[input.kind]}.${note ? ` ${note}` : ""}`;
}

/**
 * Something that happened outside the CRM (Max's other mailbox, a call, a track day). It moves the
 * lead the way the same event inside the CRM would, and writes a dated line into the notes, which
 * is what the email writer and Today read. Nothing is sent, and no automatic chase is started: a
 * follow-up from this mailbox on a conversation held somewhere else would read as a stranger.
 */
export async function logOutsideContact(id: string, input: OutsideContactInput, client?: StoreClient): Promise<Lead | null> {
  const supabase = await getStoreClient(client);
  const existing = await getLeadById(id, supabase);
  if (!existing) return null;

  // Noon UTC on the day keeps the date the same in every US time zone.
  const at = new Date(`${input.on}T12:00:00Z`).toISOString();
  const later = (current: string | null) => (current && current > at ? current : at);
  const theirs = input.kind === "they-replied";
  const stillOpen = existing.status === "new" || existing.status === "contacted" || existing.status === "nurture";
  const line = outsideContactLine(input);

  const { data, error } = await supabase
    .from("leads")
    .update({
      notes: existing.notes.trim() ? `${line}\n${existing.notes.trim()}` : line,
      ...(theirs ? { last_reply_at: later(existing.lastReplyAt) } : { last_contacted_at: later(existing.lastContactedAt) }),
      ...(stillOpen && {
        status: theirs ? "replied" : "contacted",
        status_reason: theirs ? "They replied (outside the CRM)" : "Contacted outside the CRM",
      }),
      // Whose move: ours is made when we reached out; a reply Max already handled elsewhere leaves
      // nobody waiting on anybody.
      ...(!existing.doNotContact && existing.status !== "converted" && existing.status !== "lost" && { awaiting: theirs ? null : "them" }),
      // No date survives this. A lead that wrote in carries today's "reply to them" date, and a
      // date that has come on a lead we're waiting on is exactly what the worker chases.
      follow_up_on: null,
      follow_up_soft: false,
      next_action: "",
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  const lead = rowToLead(data as LeadRow);

  await logActivity({ entityType: "lead", entityId: id, entityLabel: lead.businessName, action: "updated", detail: line }, client);
  return lead;
}

// The one status a person sets: a judgment call no event can make. Stops follow-ups too.
export async function markLeadNotAFit(id: string, client?: StoreClient): Promise<Lead | null> {
  return updateLead(id, { status: "lost", statusReason: "Not a fit", awaiting: null, followUpOn: null, nextAction: "" }, client);
}

/** Off the daily chase but not lost: no follow-ups until they write back or someone reopens it. */
export async function markLeadQuiet(id: string, client?: StoreClient): Promise<Lead | null> {
  const lead = await updateLead(id, { status: "nurture", statusReason: "Gone quiet: moved by hand", followUpOn: null, nextAction: "Check in now and then" }, client);
  // A queued chase is moot once they're off the list.
  const supabase = await getStoreClient(client);
  const { error } = await supabase
    .from("email_drafts")
    .update({ status: "discarded", updated_at: new Date().toISOString() })
    .eq("lead_id", id)
    .eq("kind", "follow_up")
    .eq("status", "pending");
  if (error) throw error;
  return lead;
}

/** Back on the active list from Gone quiet or Closed (never undoes "asked not to be contacted"). */
export async function reopenLead(id: string, client?: StoreClient): Promise<Lead | null> {
  const lead = await getLeadById(id, client);
  if (!lead || lead.doNotContact) return null;
  const status = lead.lastContactedAt ? "contacted" : "new";
  return updateLead(id, { status, statusReason: "Reopened", nextAction: "", followUpOn: null }, client);
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
