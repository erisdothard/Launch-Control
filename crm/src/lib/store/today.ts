import { getStoreClient, type StoreClient } from "./db";
import { getLeads } from "./leads";
import { getDeals } from "./deals";
import { getPendingDrafts, type EmailDraft } from "./drafts";
import { getEvents } from "./calendar";
import { matchesView, type CalendarEvent, type Deal, type DealStage, type Lead } from "./types";
import { teamTodayISO } from "@/lib/leads/followUp";
import { emailConfig } from "@/lib/email/config";
import { teamLocalToUtc } from "@/lib/email/merge";

// The Today screen: everything waiting on Max, ranked, plus his day and the pipeline.
// Built on the server; strings that depend on "now" are computed here once so the
// client renders exactly what the server did (no hydration drift).

export const TEAM_TIME_ZONE = emailConfig.teamTimeZone;
/** PostgREST returns at most 1000 rows a request; .in() lists stay short enough for the URL. */
const PAGE = 1000;
const IN_CHUNK = 100;

export type TodayKind = "reply" | "followup" | "new";
export type TodayTone = "hot" | "warm" | "new";
/** What the one primary button does. */
export type TodayAction = "send" | "write" | "call";

export interface TodayItem {
  /** Stable key: the lead id (the queue holds one item per lead). */
  key: string;
  leadId: string;
  kind: TodayKind;
  tone: TodayTone;
  action: TodayAction;
  draft: { id: string; subject: string; body: string; to: string } | null;
  /** The person when we know one, else the business. */
  name: string;
  firstName: string;
  initials: string;
  /** Business name, or null when `name` already is the business. */
  company: string | null;
  role: string | null;
  value: number | null;
  phone: string;
  email: string;
  /** "Waiting 19 hours", "Follow-up due today", "Came in 7:58am". */
  waitLabel: string;
  /** What they wrote last, when they wrote. */
  quote: { text: string; said: string } | null;
  /** Context when there is no inbound message to quote. */
  note: { text: string; said: string } | null;
  /** One or two lines for the list row. */
  summary: string;
  meta: string[];
  /** The lede's last sentence when this item leads the queue. */
  startHint: string;
  /** Last send failure recorded on the draft. */
  error: string | null;
  /** Follow-ups only: the due day (YYYY-MM-DD, team time) and how many days past it. */
  dueOn?: string;
  lateDays?: number;
}

export interface AgendaEvent {
  id: string;
  title: string;
  who: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  time: string; // "1:00" in team time
}

export interface PipelineStage {
  stage: DealStage;
  label: string;
  total: number;
  count: number;
}

export interface TodayFigures {
  openTotal: number;
  stages: PipelineStage[];
  wonQuarter: { total: number; count: number; quarterLabel: string };
  /** Null when nobody was emailed in the window: a rate of nothing isn't a figure. */
  replyRate: { pct: number; replied: number; emailed: number } | null;
}

export interface TodayData {
  greeting: string;
  firstName: string | null;
  items: TodayItem[];
  agenda: AgendaEvent[];
  figures: TodayFigures;
  nowISO: string;
  demo: boolean;
}

// ---------------------------------------------------------------------------
// Formatting (team time, so the server and the browser agree)

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function teamParts(iso: string | Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TEAM_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).formatToParts(typeof iso === "string" ? new Date(iso) : iso);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { hour: get("hour"), minute: get("minute"), period: get("dayPeriod").toLowerCase(), weekday: get("weekday"), month: get("month"), day: get("day") };
}

/** "1:00" — the agenda shows the clock without am/pm, like the mock. */
export function clockTime(iso: string | Date): string {
  const p = teamParts(iso);
  return `${p.hour}:${p.minute}`;
}

/** "3:14pm" */
function shortTime(iso: string): string {
  const p = teamParts(iso);
  return `${p.hour}:${p.minute}${p.period}`;
}

function teamDay(iso: string): string {
  return teamTodayISO(new Date(iso), TEAM_TIME_ZONE);
}

/** "today 7:40am", "yesterday 3:14pm", "Monday 9:02am", "Oct 3" */
export function whenSaid(iso: string, now: Date): string {
  const today = teamTodayISO(now, TEAM_TIME_ZONE);
  const day = teamDay(iso);
  if (day === today) return `today ${shortTime(iso)}`;
  if (day === teamTodayISO(new Date(now.getTime() - DAY_MS), TEAM_TIME_ZONE)) return `yesterday ${shortTime(iso)}`;
  const p = teamParts(iso);
  if (now.getTime() - new Date(iso).getTime() < 6 * DAY_MS) return `${p.weekday} ${shortTime(iso)}`;
  return `${p.month} ${p.day}`;
}

function waitingFor(iso: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - new Date(iso).getTime());
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return mins <= 1 ? "Waiting a minute" : `Waiting ${mins} minutes`;
  const hours = Math.floor(ms / HOUR_MS);
  if (hours < 48) return hours === 1 ? "Waiting an hour" : `Waiting ${hours} hours`;
  return `Waiting ${Math.floor(ms / DAY_MS)} days`;
}

function daysBetween(fromDay: string, toDay: string): number {
  const [a, b] = [fromDay, toDay].map((d) => {
    const [y, m, dd] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, dd);
  });
  return Math.round((b - a) / DAY_MS);
}

function initialsOf(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** First line of real content: drops quoted history and signatures from an email body. */
function firstWords(body: string, max = 220): string {
  const lines: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(>|On .+ wrote:|-----Original Message-----|From: )/.test(line) || line === "--") break;
    if (line) lines.push(line);
  }
  const text = lines.join(" ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function oneLine(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const CALL_HINT = /\b(call|phone|ring|dial)\b/i;

// ---------------------------------------------------------------------------
// Greeting

const FIRST_NAME_BY_LOCAL: Record<string, string> = { maxwell: "Max", max: "Max", eris: "Eris" };

export async function firstNameFor(email: string | null | undefined, client?: StoreClient): Promise<string | null> {
  if (!email) return null;
  const local = email.split("@")[0].toLowerCase();
  if (FIRST_NAME_BY_LOCAL[local]) return FIRST_NAME_BY_LOCAL[local];
  const supabase = await getStoreClient(client);
  const { data } = await supabase.from("email_accounts").select("signature_name").ilike("address", email).limit(1).maybeSingle();
  const first = data?.signature_name?.trim().split(/\s+/)[0];
  return first || null;
}

export function greetingFor(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TEAM_TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// ---------------------------------------------------------------------------
// The queue

interface Inbound {
  body: string;
  at: string;
}

async function lastInboundByLead(leadIds: string[], client?: StoreClient): Promise<Map<string, Inbound>> {
  const out = new Map<string, Inbound>();
  if (leadIds.length === 0) return out;
  const supabase = await getStoreClient(client);
  for (let i = 0; i < leadIds.length; i += IN_CHUNK) {
    const chunk = leadIds.slice(i, i + IN_CHUNK);
    // Newest first, so the first row seen for a lead is its latest; page on until every lead in
    // the chunk has one or the rows run out.
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("email_messages")
        .select("lead_id, body_text, created_at")
        .in("lead_id", chunk)
        .eq("direction", "in")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const row of data) {
        if (row.lead_id && !out.has(row.lead_id)) out.set(row.lead_id, { body: row.body_text, at: row.created_at });
      }
      if (data.length < PAGE || chunk.every((id) => out.has(id))) break;
    }
  }
  return out;
}

interface Ctx {
  now: Date;
  today: string;
  inbound: Map<string, Inbound>;
  openValue: Map<string, number>;
  callToday: Map<string, CalendarEvent>;
}

function person(lead: Lead) {
  const contact = lead.prospect?.contactName?.trim() || null;
  const name = contact || lead.businessName;
  return {
    name,
    firstName: contact ? contact.split(/\s+/)[0] : lead.businessName,
    initials: initialsOf(name),
    company: contact ? lead.businessName : null,
    role: lead.prospect?.contactTitle?.trim() || null,
  };
}

function base(lead: Lead, ctx: Ctx) {
  return {
    key: lead.id,
    leadId: lead.id,
    ...person(lead),
    value: ctx.openValue.get(lead.id) ?? null,
    phone: lead.phone,
    email: lead.email,
  };
}

function callHint(lead: Lead, first: string, ctx: Ctx): string | null {
  const ev = ctx.callToday.get(lead.id);
  if (!ev || new Date(ev.startsAt).getTime() < ctx.now.getTime()) return null;
  return `Start with ${first}; your call is at ${clockTime(ev.startsAt)}.`;
}

function replyItem(lead: Lead, draft: EmailDraft | null, ctx: Ctx): TodayItem {
  const b = base(lead, ctx);
  const inbound = draft?.replyingTo ? { body: draft.replyingTo.body, at: draft.replyingTo.at } : ctx.inbound.get(lead.id) ?? null;
  const since = inbound?.at ?? lead.lastReplyAt ?? draft?.createdAt ?? lead.createdAt;
  const waited = ctx.now.getTime() - new Date(since).getTime();
  const waitLabel = waitingFor(since, ctx.now);
  const text = inbound ? firstWords(inbound.body) : "";
  return {
    ...b,
    kind: "reply",
    tone: waited > 2 * HOUR_MS ? "hot" : "warm",
    action: draft ? "send" : "write",
    draft: draft ? { id: draft.id, subject: draft.subject, body: draft.body, to: draft.to } : null,
    waitLabel,
    quote: text ? { text, said: `${b.firstName}, ${whenSaid(inbound!.at, ctx.now)}` } : null,
    note: text ? null : { text: lead.statusReason || "They wrote back.", said: `${b.firstName}, ${whenSaid(since, ctx.now)}` },
    summary: text ? `Wrote: “${oneLine(text, 110)}”` : lead.statusReason || "Wrote back.",
    meta: [waitLabel, draft ? "Reply drafted" : "No draft yet"],
    startHint: callHint(lead, b.firstName, ctx) ?? `Start with ${b.firstName}, who has been ${waitLabel.toLowerCase()}.`,
    error: draft?.error ?? null,
  };
}

function followUpItem(lead: Lead, draft: EmailDraft | null, ctx: Ctx): TodayItem {
  const b = base(lead, ctx);
  const due = lead.followUpOn ?? (draft ? teamDay(draft.createdAt) : ctx.today);
  const late = daysBetween(due, ctx.today);
  const waitLabel = late <= 0 ? "Follow-up due today" : late === 1 ? "Follow-up a day overdue" : `Follow-up ${late} days overdue`;
  const number = draft?.followUpNumber ?? lead.followUpCount + 1;
  const ordinal = ["", "First", "Second", "Third", "Fourth", "Fifth"][number] ?? `Follow-up ${number}`;
  const lastWrote = lead.lastContactedAt ? `You last wrote ${whenSaid(lead.lastContactedAt, ctx.now)}` : "No reply yet";
  const wantsCall = !draft && !!lead.phone && (CALL_HINT.test(lead.nextAction) || !lead.email);
  const chased = lead.lastContactedAt !== null;
  const noteText = lead.nextAction?.trim() || (chased ? `${lastWrote}. No reply yet.` : "A follow-up date was set for this lead.");
  return {
    ...b,
    kind: "followup",
    tone: late > 0 ? "hot" : "warm",
    action: draft ? "send" : wantsCall ? "call" : "write",
    draft: draft ? { id: draft.id, subject: draft.subject, body: draft.body, to: draft.to } : null,
    waitLabel,
    quote: null,
    note: { text: noteText, said: wantsCall ? lead.phone : chased ? `${ordinal} follow-up · ${lastWrote}` : "Not emailed yet" },
    summary: lead.nextAction?.trim() || (chased ? `${lastWrote}, no reply. ${ordinal} follow-up is due.` : "Follow-up date has come."),
    meta: [waitLabel, draft ? "Follow-up drafted" : wantsCall ? lead.phone : "No draft yet"],
    startHint:
      callHint(lead, b.firstName, ctx) ??
      (late > 0 ? `Start with ${b.firstName}; the follow-up is overdue.` : `Start with ${b.firstName}; the follow-up is due today.`),
    error: draft?.error ?? null,
    dueOn: due,
    lateDays: Math.max(0, late),
  };
}

function inquiryItem(lead: Lead, ctx: Ctx): TodayItem {
  const b = base(lead, ctx);
  const day = teamDay(lead.createdAt);
  const cameIn = day === ctx.today ? `Came in ${shortTime(lead.createdAt)}` : `Came in ${whenSaid(lead.createdAt, ctx.now)}`;
  const said = firstWords(lead.notes || "", 200);
  const wantsCall = !!lead.phone && !lead.email;
  return {
    ...b,
    kind: "new",
    tone: "new",
    action: wantsCall ? "call" : "write",
    draft: null,
    waitLabel: cameIn,
    quote: said ? { text: said, said: `Website form, ${whenSaid(lead.createdAt, ctx.now)}` } : null,
    note: said ? null : { text: "New website inquiry. Nobody has written back yet.", said: `Website form, ${whenSaid(lead.createdAt, ctx.now)}` },
    summary: said ? `New website inquiry: “${oneLine(said, 100)}”` : "New website inquiry.",
    meta: [day === ctx.today ? `Website, ${shortTime(lead.createdAt)}` : cameIn, ...(lead.phone ? [lead.phone] : [])],
    startHint: callHint(lead, b.firstName, ctx) ?? `Start with ${b.firstName}, who ${day === ctx.today ? "came in today" : "is still waiting for a first reply"}.`,
    error: null,
  };
}

/**
 * Max's work, ranked: replies needed (oldest wait first), then follow-ups due (most overdue first),
 * then new inquiries. One item per lead. Membership is matchesView's, the same definition the Leads
 * tabs, the Inbox's Replies needed and the Tasks summary count, so the numbers always agree. A
 * pending draft rides along on its lead; it never puts a lead in the queue by itself.
 */
export function buildQueue(leads: Lead[], drafts: EmailDraft[], deals: Deal[], events: CalendarEvent[], inbound: Map<string, Inbound>, now: Date): TodayItem[] {
  const today = teamTodayISO(now, TEAM_TIME_ZONE);
  const openValue = new Map<string, number>();
  for (const d of deals) {
    if (!d.fromLeadId || d.stage === "won" || d.stage === "lost") continue;
    openValue.set(d.fromLeadId, (openValue.get(d.fromLeadId) ?? 0) + Number(d.value));
  }
  const callToday = new Map<string, CalendarEvent>();
  for (const e of events) if (e.leadId && !callToday.has(e.leadId)) callToday.set(e.leadId, e);
  const ctx: Ctx = { now, today, inbound, openValue, callToday };

  const replyDraft = new Map<string, EmailDraft>();
  const followDraft = new Map<string, EmailDraft>();
  for (const d of drafts) {
    const map = d.kind === "reply" ? replyDraft : followDraft;
    if (!map.has(d.leadId)) map.set(d.leadId, d);
  }

  const waitedSince = (l: Lead) => replyDraft.get(l.id)?.replyingTo?.at ?? l.lastReplyAt ?? l.createdAt;
  const replies = leads
    .filter((l) => matchesView(l, "needs-reply", today))
    .sort((a, b) => waitedSince(a).localeCompare(waitedSince(b)))
    .map((l) => replyItem(l, replyDraft.get(l.id) ?? null, ctx));

  const dueOf = (l: Lead) => l.followUpOn ?? today;
  const followUps = leads
    .filter((l) => matchesView(l, "follow-up", today))
    .sort((a, b) => dueOf(a).localeCompare(dueOf(b)) || (a.lastContactedAt ?? "").localeCompare(b.lastContactedAt ?? ""))
    .map((l) => followUpItem(l, followDraft.get(l.id) ?? null, ctx));

  const inquiries = leads
    .filter((l) => matchesView(l, "new-inquiries", today))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((l) => inquiryItem(l, ctx));

  return [...replies, ...followUps, ...inquiries];
}

// ---------------------------------------------------------------------------
// Right rail

const STAGE_LABEL: Record<DealStage, string> = {
  negotiation: "Negotiating",
  proposal: "Proposal out",
  inquiry: "Talking",
  won: "Won",
  lost: "Lost",
};
const OPEN_STAGES: DealStage[] = ["negotiation", "proposal", "inquiry"];

function quarterStart(now: Date): { iso: string; label: string } {
  const today = teamTodayISO(now, TEAM_TIME_ZONE);
  const [y, m] = today.split("-").map(Number);
  const q = Math.floor((m - 1) / 3);
  const startMonth = q * 3 + 1;
  return { iso: `${y}-${String(startMonth).padStart(2, "0")}-01`, label: `Q${q + 1}` };
}

async function wonDates(client?: StoreClient): Promise<Map<string, string>> {
  // Deals have no closed-at column; the activity log records the move to "won".
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("activity_log")
    .select("entity_id, created_at")
    .eq("entity_type", "deal")
    .eq("action", "status_changed")
    .ilike("detail", "%won%")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return new Map();
  const out = new Map<string, string>();
  for (const r of data) if (!out.has(r.entity_id)) out.set(r.entity_id, r.created_at);
  return out;
}

export function buildFigures(deals: Deal[], won: Map<string, string>, reply: TodayFigures["replyRate"], now: Date): TodayFigures {
  const stages = OPEN_STAGES.map((stage) => {
    const inStage = deals.filter((d) => d.stage === stage);
    return { stage, label: STAGE_LABEL[stage], count: inStage.length, total: inStage.reduce((s, d) => s + Number(d.value), 0) };
  }).filter((s) => s.count > 0);
  const quarter = quarterStart(now);
  const wonThisQuarter = deals.filter((d) => d.stage === "won" && teamDay(won.get(d.id) ?? d.createdAt) >= quarter.iso);
  return {
    openTotal: stages.reduce((s, x) => s + x.total, 0),
    stages,
    wonQuarter: { total: wonThisQuarter.reduce((s, d) => s + Number(d.value), 0), count: wonThisQuarter.length, quarterLabel: quarter.label },
    replyRate: reply,
  };
}

async function replyRate(now: Date, client?: StoreClient): Promise<TodayFigures["replyRate"]> {
  // Of the people emailed in the last 30 days, how many wrote back afterwards.
  const supabase = await getStoreClient(client);
  const since = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  // Oldest first (first email, then any reply after it), read in full: a single capped request
  // would drop the newest messages, which are the replies.
  const data: { lead_id: string | null; direction: string; created_at: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .from("email_messages")
      .select("lead_id, direction, created_at")
      .gte("created_at", since)
      .not("lead_id", "is", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return null;
    data.push(...page);
    if (page.length < PAGE) break;
  }
  const firstOut = new Map<string, string>();
  const replied = new Set<string>();
  for (const m of data) {
    if (!m.lead_id) continue;
    if (m.direction === "out" && !firstOut.has(m.lead_id)) firstOut.set(m.lead_id, m.created_at);
    if (m.direction === "in" && firstOut.has(m.lead_id)) replied.add(m.lead_id);
  }
  if (firstOut.size === 0) return null;
  return { pct: Math.round((replied.size / firstOut.size) * 100), replied: replied.size, emailed: firstOut.size };
}

function toAgenda(events: CalendarEvent[], leads: Map<string, Lead>): AgendaEvent[] {
  return events.map((e) => {
    const lead = e.leadId ? leads.get(e.leadId) : undefined;
    const who = [lead ? lead.prospect?.contactName || lead.businessName : null, e.location || null].filter(Boolean).join(" · ");
    return { id: e.id, title: e.title, who, startsAt: e.startsAt, endsAt: e.endsAt, allDay: e.allDay, time: e.allDay ? "All day" : clockTime(e.startsAt) };
  });
}

/** The team's calendar day as a UTC [from, to) window. */
export function teamDayWindow(now: Date): { from: string; to: string } {
  const today = teamTodayISO(now, TEAM_TIME_ZONE);
  // Midnight to midnight in the team zone, each with its own offset (a DST day is 23 or 25 hours).
  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const from = teamLocalToUtc(today, "00:00", TEAM_TIME_ZONE);
  const to = teamLocalToUtc(tomorrow, "00:00", TEAM_TIME_ZONE);
  const start = Date.UTC(y, m - 1, d);
  return { from: from ?? new Date(start).toISOString(), to: to ?? new Date(start + DAY_MS).toISOString() };
}

export async function getToday(userEmail: string | null | undefined, client?: StoreClient): Promise<TodayData> {
  const now = new Date();
  const { from, to } = teamDayWindow(now);
  const [leads, drafts, deals, events, firstName, won, rate] = await Promise.all([
    getLeads(undefined, client),
    getPendingDrafts(client),
    getDeals(client),
    getEvents(from, to, client),
    firstNameFor(userEmail, client),
    wonDates(client),
    replyRate(now, client),
  ]);
  const today = teamTodayISO(now, TEAM_TIME_ZONE);
  const candidates = leads.filter((l) => matchesView(l, "needs-reply", today)).map((l) => l.id);
  const inbound = await lastInboundByLead(candidates, client);
  const byId = new Map(leads.map((l) => [l.id, l]));
  return {
    greeting: greetingFor(now),
    firstName,
    items: buildQueue(leads, drafts, deals, events, inbound, now),
    agenda: toAgenda(events, byId),
    figures: buildFigures(deals, won, rate, now),
    nowISO: now.toISOString(),
    demo: false,
  };
}
