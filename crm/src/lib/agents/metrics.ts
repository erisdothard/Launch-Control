import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAutoReply } from "@/lib/email/deliverability";

// One definition of every pipeline number, the CRM's copy. The twin is
// tools/leadgen/leadgen/metrics.py; change both together, or the board and the agents disagree.
//
// Prospects are leads the lead-gen pipeline found (source = 'lead-gen'). Website inquiries and test
// leads are not outreach results. A reply is an inbound message from a prospect that isn't an
// auto-reply (deliverability.ts isAutoReply, the same pattern metrics.py uses).
// usable = the site was actually read AND an email was found AND score >= USABLE_MIN_SCORE.
// Call-list leads (signals.call_list: no site or an unreadable one, kept for phone outreach) are a
// separate channel, so they sit outside the usable-rate denominator; the board counts them apart.

export const USABLE_MIN_SCORE = 55;
export const USABLE_TARGET = 0.7;
export const PROSPECT_SOURCE = "lead-gen";
const PAGE = 1000;

export interface ProspectRow {
  id: string;
  email: string | null;
  score: number | null;
  signals: unknown;
  status: string;
}

export interface PipelineSnapshot {
  scanned: number;
  kept: number;
  usable: number;
  usableRate: number;
  callList: number;
  draftsPending: number;
  sent: number;
  contacted: number;
  replies: number;
  repliedLeads: number;
  meetings: number;
  won: number;
}

function signalsOf(lead: ProspectRow): Record<string, unknown> {
  return lead.signals && typeof lead.signals === "object" && !Array.isArray(lead.signals) ? (lead.signals as Record<string, unknown>) : {};
}

function nonEmpty(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === "object") return Object.keys(v).length > 0;
  return Boolean(v);
}

export function siteRead(lead: ProspectRow): boolean {
  const s = signalsOf(lead);
  return nonEmpty(s.pages_crawled) && !s.crawl_error;
}

export function onCallList(lead: ProspectRow): boolean {
  return Boolean(signalsOf(lead).call_list);
}

export function isUsable(lead: ProspectRow): boolean {
  return siteRead(lead) && Boolean((lead.email ?? "").trim()) && (lead.score ?? 0) >= USABLE_MIN_SCORE;
}

export function usableRate(leads: ProspectRow[]): number {
  const pool = leads.filter((x) => !onCallList(x));
  return pool.length ? pool.filter(isUsable).length / pool.length : 0;
}

// The tables here are read with plain selects; the generated Database type is not needed for them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

async function all<T>(db: AnyClient, table: string, select: string, filter?: (q: Query) => Query): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    let q: Query = db.from(table).select(select).order("id");
    if (filter) q = filter(q);
    const { data, error } = await q.range(rows.length, rows.length + PAGE - 1);
    if (error) throw new Error(`Couldn't read ${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Pipeline totals, the same counts as metrics.py snapshot() with no window. Throws if a read fails. */
export async function pipelineSnapshot(client: unknown): Promise<PipelineSnapshot> {
  const db = client as AnyClient;
  const [leads, runs, msgs, meetings, pending] = await Promise.all([
    all<ProspectRow>(db, "leads", "id, email, score, signals, status", (q) => q.eq("source", PROSPECT_SOURCE)),
    all<{ found: number | null }>(db, "lead_gen_runs", "found", (q) => q.eq("status", "completed")),
    all<{ lead_id: string | null; direction: string; status: string; subject: string | null }>(db, "email_messages", "lead_id, direction, status, subject"),
    all<{ lead_id: string }>(db, "calendar_events", "lead_id", (q) => q.not("lead_id", "is", null)),
    all<{ id: string }>(db, "email_drafts", "id", (q) => q.eq("status", "pending")),
  ]);
  const ids = new Set(leads.map((x) => x.id));
  const sent = msgs.filter((m) => m.direction === "out" && m.status === "sent" && m.lead_id && ids.has(m.lead_id));
  const replies = msgs.filter((m) => m.direction === "in" && m.lead_id && ids.has(m.lead_id) && !isAutoReply(m.subject ?? ""));
  return {
    scanned: runs.reduce((n, r) => n + (r.found ?? 0), 0),
    kept: leads.length,
    usable: leads.filter(isUsable).length,
    usableRate: Math.round(usableRate(leads) * 1000) / 1000,
    callList: leads.filter(onCallList).length,
    draftsPending: pending.length,
    sent: sent.length,
    contacted: new Set(sent.map((m) => m.lead_id)).size,
    replies: replies.length,
    repliedLeads: new Set(replies.map((m) => m.lead_id)).size,
    meetings: meetings.filter((m) => ids.has(m.lead_id)).length,
    won: leads.filter((x) => x.status === "converted").length,
  };
}
