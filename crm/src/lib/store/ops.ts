import { getStoreClient, type StoreClient } from "./db";
import { getRuns, type LeadGenRun } from "./leadgen";
import { getEmailAccounts, type EmailAccount } from "./messages";
import { AUTOMATED_LEAD_SOURCE } from "./types";
import { TEAM_TIME_ZONE, teamDayWindow, whenSaid } from "./today";
import { teamTodayISO } from "@/lib/leads/followUp";
import { isAutoReply } from "@/lib/email/deliverability";

// Agent Ops: what the agents are doing right now, read straight from the tables they write.
// Owner-only for now. Everything is built here on the server so the page only lays it out.

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** PostgREST returns at most 1000 rows a request. */
const PAGE = 1000;
/** Feed window and length. */
const FEED_DAYS = 14;
const FEED_ITEMS = 12;
/** The Strategist compares segments only once this many people have replied. */
const REPLIES_TO_COMPARE = 10;

export type CheckState = "ok" | "down" | "waiting" | "info";

export interface OpsCheck {
  key: string;
  label: string;
  state: CheckState;
  detail: string;
  href?: string;
  action?: string;
}

export type AgentState = "working" | "idle" | "blocked" | "learning";

export interface OpsAgent {
  tag: string;
  name: string;
  seat: string;
  state: AgentState;
  stateLabel: string;
  headline: string;
  detail: string;
  href?: string;
  action?: string;
}

export interface OpsEvent {
  id: string;
  at: string;
  when: string;
  agent: string;
  text: string;
}

export interface OpsData {
  lede: string;
  checks: OpsCheck[];
  agents: OpsAgent[];
  feed: OpsEvent[];
}

interface Heartbeat {
  beatAt: string;
  everyS: number;
}

interface DraftRow {
  kind: string;
  status: string;
  created_at: string;
}

interface MessageRow {
  lead_id: string | null;
  direction: string;
  created_at: string;
  // An inbound message counts as a reply only from a lead-gen prospect and only when it isn't an
  // auto-reply (same rule as crm/src/lib/agents/metrics.ts), so test leads never read as results.
  realReply: boolean;
}

interface SuppressionRow {
  reason: string;
  created_at: string;
}

interface SegmentReplies {
  segment: string;
  emailed: number;
  replied: number;
}

export interface OpsRaw {
  heartbeat: Heartbeat | null;
  accounts: EmailAccount[];
  autoSend: boolean;
  dailyCap: number;
  runs: LeadGenRun[];
  notContacted: number;
  scored60: number;
  drafts: DraftRow[];
  messages: MessageRow[];
  sentToday: number;
  suppressions: SuppressionRow[];
  segments: SegmentReplies[];
}

// ---------------------------------------------------------------------------
// Reads

async function readHeartbeat(supabase: StoreClient): Promise<Heartbeat | null> {
  // Before the migration is applied (or the worker is updated) there is simply no row.
  const { data, error } = await supabase.from("worker_heartbeats").select("beat_at, detail").eq("name", "automation").maybeSingle();
  if (error || !data) return null;
  const detail = (typeof data.detail === "object" && data.detail !== null && !Array.isArray(data.detail) ? data.detail : {}) as { every_s?: unknown };
  return { beatAt: data.beat_at, everyS: typeof detail.every_s === "number" ? detail.every_s : 300 };
}

async function countGeneratedLeads(supabase: StoreClient, only: "new" | "60+"): Promise<number> {
  let query = supabase.from("leads").select("id", { count: "exact", head: true }).eq("source", AUTOMATED_LEAD_SOURCE);
  query = only === "new" ? query.eq("status", "new") : query.gte("score", 60);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function readMessages(supabase: StoreClient): Promise<MessageRow[]> {
  // All of it, oldest first: the Strategist needs each lead's first email and any reply after.
  const rows: MessageRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("email_messages")
      .select("lead_id, direction, created_at, subject, leads(source)")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const m of data) {
      const lead = Array.isArray(m.leads) ? m.leads[0] : m.leads;
      const realReply = m.direction === "in" && lead?.source === AUTOMATED_LEAD_SOURCE && !isAutoReply(m.subject ?? "");
      rows.push({ lead_id: m.lead_id, direction: m.direction, created_at: m.created_at, realReply });
    }
    if (data.length < PAGE) return rows;
  }
}

async function readSegments(supabase: StoreClient, messages: MessageRow[]): Promise<SegmentReplies[]> {
  const emailedAt = new Map<string, string>();
  const replied = new Set<string>();
  for (const m of messages) {
    if (!m.lead_id) continue;
    if (m.direction === "out" && !emailedAt.has(m.lead_id)) emailedAt.set(m.lead_id, m.created_at);
    if (m.realReply && emailedAt.has(m.lead_id)) replied.add(m.lead_id);
  }
  const ids = [...emailedAt.keys()];
  const segmentOf = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from("leads").select("id, segment").in("id", ids.slice(i, i + 150));
    if (error) throw error;
    for (const l of data) segmentOf.set(l.id, l.segment || "Other");
  }
  const bySegment = new Map<string, SegmentReplies>();
  for (const id of ids) {
    const segment = segmentOf.get(id) ?? "Other";
    const row = bySegment.get(segment) ?? { segment, emailed: 0, replied: 0 };
    row.emailed += 1;
    if (replied.has(id)) row.replied += 1;
    bySegment.set(segment, row);
  }
  return [...bySegment.values()].sort((a, b) => b.emailed - a.emailed);
}

export async function getOpsRaw(now: Date, client?: StoreClient): Promise<OpsRaw> {
  const supabase = await getStoreClient(client);
  const since = new Date(now.getTime() - FEED_DAYS * DAY_MS).toISOString();
  const today = teamDayWindow(now);

  const [heartbeat, accounts, settings, runs, notContacted, scored60, drafts, messages, sentToday, suppressions] = await Promise.all([
    readHeartbeat(supabase),
    getEmailAccounts(supabase),
    supabase.from("automation_settings").select("auto_send_follow_ups, daily_send_cap").limit(1).maybeSingle(),
    getRuns(10, supabase),
    countGeneratedLeads(supabase, "new"),
    countGeneratedLeads(supabase, "60+"),
    supabase.from("email_drafts").select("kind, status, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(PAGE),
    readMessages(supabase),
    supabase.from("email_messages").select("id", { count: "exact", head: true }).eq("direction", "out").gte("created_at", today.from).lt("created_at", today.to),
    supabase.from("email_suppressions").select("reason, created_at").order("created_at", { ascending: false }).limit(PAGE),
  ]);
  if (settings.error) throw settings.error;
  if (drafts.error) throw drafts.error;
  if (sentToday.error) throw sentToday.error;
  if (suppressions.error) throw suppressions.error;

  // Pending drafts can be older than the feed window; count them on their own.
  const { data: pending, error: pendingError } = await supabase.from("email_drafts").select("kind, status, created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(PAGE);
  if (pendingError) throw pendingError;
  const seen = new Set(drafts.data.map((d) => `${d.created_at}|${d.kind}|${d.status}`));
  const allDrafts = [...drafts.data, ...pending.filter((d) => !seen.has(`${d.created_at}|${d.kind}|${d.status}`))];

  return {
    heartbeat,
    accounts,
    autoSend: settings.data?.auto_send_follow_ups ?? false,
    dailyCap: settings.data?.daily_send_cap ?? 25,
    runs,
    notContacted,
    scored60,
    drafts: allDrafts,
    messages,
    sentToday: sentToday.count ?? 0,
    suppressions: suppressions.data,
    segments: await readSegments(supabase, messages),
  };
}

// ---------------------------------------------------------------------------
// Building the screen (pure: same input, same output)

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function accountName(a: EmailAccount): string {
  return a.displayName?.trim() || a.address.split("@")[0];
}

function workerCheck(raw: OpsRaw, now: Date): OpsCheck {
  const hb = raw.heartbeat;
  if (!hb) {
    const last = raw.drafts[0]?.created_at;
    return {
      key: "worker",
      label: "Agent worker",
      state: "waiting",
      detail: `No check-in yet. It starts reporting here once it's updated on Railway.${last ? ` Last seen working ${whenSaid(last, now)}.` : ""}`,
    };
  }
  // Three missed passes means it has stopped, not that it is between passes.
  const late = now.getTime() - new Date(hb.beatAt).getTime() > 3 * hb.everyS * 1000;
  return {
    key: "worker",
    label: "Agent worker",
    state: late ? "down" : "ok",
    detail: late ? `Stopped. Last check-in ${whenSaid(hb.beatAt, now)}. Check the worker on Railway.` : `Running. Checked in ${whenSaid(hb.beatAt, now)}.`,
  };
}

function mailboxChecks(raw: OpsRaw): OpsCheck[] {
  return raw.accounts.map((a) => {
    const ok = a.status === "active";
    return {
      key: `mailbox-${a.id}`,
      label: `${accountName(a)}'s mailbox`,
      state: ok ? "ok" : "down",
      detail: ok ? `Connected. Mail sends and arrives through ${a.address}.` : `Disconnected. Nothing sends from or arrives in ${a.address} until it's reconnected.`,
      ...(ok ? {} : { href: "/admin/settings", action: "Reconnect" }),
    };
  });
}

function sendingCheck(raw: OpsRaw): OpsCheck {
  return {
    key: "sending",
    label: "Automatic sending",
    state: "info",
    detail: raw.autoSend
      ? `On. Follow-ups go out by themselves, up to ${raw.dailyCap} a day.`
      : "Off. Every email waits for your OK before it goes.",
    href: "/admin/settings",
    action: "Change",
  };
}

function prospector(raw: OpsRaw, now: Date): OpsAgent {
  const running = raw.runs.find((r) => r.status === "running" || r.status === "queued");
  const last = raw.runs.find((r) => r.status === "completed");
  const waiting = `${plural(raw.notContacted, "lead hasn't", "leads haven't")} been contacted yet. ${raw.scored60} score 60 or more.`;
  const base = { tag: "01", name: "The Prospector", seat: "Finds and scores leads", href: "/admin/lead-gen", action: "Find leads" };
  if (running) {
    return { ...base, state: "working", stateLabel: "Working", headline: running.stage ? `Running now: ${running.stage}.` : "Running now.", detail: waiting };
  }
  if (!last) return { ...base, state: "idle", stateLabel: "Idle", headline: "Hasn't run yet.", detail: waiting };
  const when = whenSaid(last.finishedAt ?? last.startedAt, now);
  const stale = now.getTime() - new Date(last.finishedAt ?? last.startedAt).getTime() > 7 * DAY_MS;
  return {
    ...base,
    state: "idle",
    stateLabel: stale ? "Idle a while" : "Idle",
    headline: `Last run ${when}: found ${last.found}, kept ${last.kept}.`,
    detail: waiting,
  };
}

function writer(raw: OpsRaw, now: Date, canSend: boolean): OpsAgent {
  const pending = raw.drafts.filter((d) => d.status === "pending");
  const newest = raw.drafts[0]?.created_at;
  const base = { tag: "02", name: "The Outreach Writer", seat: "Drafts replies and follow-ups", href: "/admin/inbox?folder=drafts", action: "Review drafts" };
  const wrote = newest ? `Last wrote ${whenSaid(newest, now)}.` : "Hasn't written anything yet.";
  if (pending.length > 0 && !canSend) {
    return { ...base, state: "blocked", stateLabel: "Blocked", headline: `${plural(pending.length, "draft is", "drafts are")} waiting, and none can send.`, detail: `${wrote} Reconnect a mailbox to let them go out.` };
  }
  return {
    ...base,
    state: pending.length > 0 ? "working" : "idle",
    stateLabel: pending.length > 0 ? "Waiting on you" : "Idle",
    headline: pending.length > 0 ? `${plural(pending.length, "draft is", "drafts are")} waiting for your OK.` : "Nothing waiting. New drafts appear as leads go quiet or reply.",
    detail: wrote,
  };
}

function guardian(raw: OpsRaw): OpsAgent {
  const optOut = raw.suppressions.filter((s) => s.reason === "opt_out").length;
  const bounced = raw.suppressions.filter((s) => s.reason === "bounce").length;
  const blocked = raw.suppressions.length;
  return {
    tag: "RC",
    name: "Guardian",
    seat: "Checks every send",
    state: "working",
    stateLabel: "On watch",
    headline: `${raw.sentToday} of ${raw.dailyCap} sent today.`,
    detail:
      blocked === 0
        ? "No address blocked yet. Anyone who unsubscribes or bounces is never emailed again."
        : `${plural(blocked, "address is", "addresses are")} blocked for good: ${optOut} unsubscribed, ${bounced} bounced.`,
    href: "/admin/settings",
    action: "Rules",
  };
}

function strategist(raw: OpsRaw): OpsAgent {
  const emailed = raw.segments.reduce((s, x) => s + x.emailed, 0);
  const replied = raw.segments.reduce((s, x) => s + x.replied, 0);
  const base = { tag: "03", name: "The Strategist", seat: "Learns what gets replies", state: "learning" as const, stateLabel: "Watching only" };
  if (emailed === 0) return { ...base, headline: "Nothing to learn from yet.", detail: "It starts once the first emails go out." };
  if (replied < REPLIES_TO_COMPARE) {
    const top = raw.segments[0];
    return {
      ...base,
      headline: `Too early to call: ${replied} of ${emailed} people wrote back.`,
      detail: `It compares segments after ${REPLIES_TO_COMPARE} replies. Most emailed so far: ${top.segment} (${top.emailed}).`,
    };
  }
  // Rank segments with at least three people emailed, so one lucky reply can't top the list.
  const best = raw.segments.filter((s) => s.emailed >= 3).sort((a, b) => b.replied / b.emailed - a.replied / a.emailed)[0];
  return {
    ...base,
    headline: best ? `Best replies so far: ${best.segment}, ${best.replied} of ${best.emailed}.` : `${replied} of ${emailed} people wrote back.`,
    detail: "It reports what's working. It doesn't change who gets emailed yet.",
  };
}

const byHour = (iso: string) => iso.slice(0, 13);
const byTeamDay = (iso: string) => teamTodayISO(new Date(iso), TEAM_TIME_ZONE);

/** One feed line per bucket per kind of thing, so 41 drafts read as one event, not 41. */
function grouped<T>(rows: T[], at: (r: T) => string, key: (r: T) => string, bucket: (iso: string) => string = byHour): { at: string; key: string; count: number }[] {
  const groups = new Map<string, { at: string; key: string; count: number }>();
  for (const r of rows) {
    const iso = at(r);
    const id = `${key(r)}|${bucket(iso)}`;
    const g = groups.get(id);
    if (g) {
      g.count += 1;
      if (iso > g.at) g.at = iso;
    } else {
      groups.set(id, { at: iso, key: key(r), count: 1 });
    }
  }
  return [...groups.values()];
}

function feed(raw: OpsRaw, now: Date): OpsEvent[] {
  const since = new Date(now.getTime() - FEED_DAYS * DAY_MS).toISOString();
  const events: Omit<OpsEvent, "when">[] = [];

  for (const r of raw.runs) {
    const at = r.finishedAt ?? r.startedAt;
    if (at < since || r.status === "queued" || r.status === "running") continue;
    const text = r.status === "completed" ? `Finished a search: found ${r.found}, kept ${r.kept}, threw out ${r.excluded}.` : `A search ${r.status === "cancelled" ? "was cancelled" : "failed"}.`;
    events.push({ id: `run-${r.id}`, at, agent: "Prospector", text });
  }

  const drafted = raw.drafts.filter((d) => d.created_at >= since);
  for (const g of grouped(drafted, (d) => d.created_at, (d) => d.kind)) {
    const what = g.key === "reply" ? plural(g.count, "reply", "replies") : plural(g.count, "follow-up", "follow-ups");
    events.push({ id: `draft-${g.key}-${g.at}`, at: g.at, agent: "Writer", text: `Drafted ${what}.` });
  }

  // Sends batch into one line a day; every reply stays its own line, since each one matters.
  const recent = raw.messages.filter((m) => m.created_at >= since && (m.direction === "out" || m.realReply));
  for (const g of grouped(recent, (m) => m.created_at, (m) => (m.direction === "in" ? `in-${m.created_at}` : "out"), byTeamDay)) {
    g.key = g.key.startsWith("in-") ? "in" : "out";
    const text = g.key === "out" ? `${plural(g.count, "email", "emails")} went out that day.` : "A prospect wrote back.";
    events.push({ id: `mail-${g.key}-${g.at}`, at: g.at, agent: g.key === "out" ? "Sent" : "Inbox", text });
  }

  const blocked = raw.suppressions.filter((s) => s.created_at >= since);
  for (const g of grouped(blocked, (s) => s.created_at, (s) => s.reason)) {
    const why = g.key === "bounce" ? "bounced" : g.key === "opt_out" ? "unsubscribed" : "added by hand";
    events.push({ id: `block-${g.key}-${g.at}`, at: g.at, agent: "Guardian", text: `Blocked ${plural(g.count, "address", "addresses")}: ${why}.` });
  }

  return events
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, FEED_ITEMS)
    .map((e) => ({ ...e, when: whenSaid(e.at, now) }));
}

function lede(checks: OpsCheck[], agents: OpsAgent[]): string {
  const down = checks.filter((c) => c.state === "down");
  const mailboxes = down.filter((c) => c.key.startsWith("mailbox-"));
  const worker = down.find((c) => c.key === "worker");
  const pending = agents.find((a) => a.tag === "02");
  if (worker) return "The agent worker has stopped. Nothing is being written or checked until it restarts.";
  if (mailboxes.length > 0) {
    const which = mailboxes.length === checks.filter((c) => c.key.startsWith("mailbox-")).length ? (mailboxes.length === 1 ? "The mailbox needs" : "Both mailboxes need") : `${mailboxes.map((c) => c.label).join(" and ")} needs`;
    return `${which} reconnecting. The agents keep writing, but nothing goes out or comes in until then.`;
  }
  if (pending && pending.state === "working") return `Everything is running. ${pending.headline}`;
  return "Everything is running. Nothing is waiting on you.";
}

export function buildOps(raw: OpsRaw, now: Date): OpsData {
  const canSend = raw.accounts.some((a) => a.status === "active");
  const checks = [workerCheck(raw, now), ...mailboxChecks(raw), sendingCheck(raw)];
  const agents = [prospector(raw, now), writer(raw, now, canSend), guardian(raw), strategist(raw)];
  return { lede: lede(checks, agents), checks, agents, feed: feed(raw, now) };
}

export async function getOps(client?: StoreClient): Promise<OpsData> {
  const now = new Date();
  return buildOps(await getOpsRaw(now, client), now);
}
