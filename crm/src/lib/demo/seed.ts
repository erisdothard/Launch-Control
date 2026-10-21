import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreClient } from "@/lib/store/db";
import type { Database } from "@/lib/supabase/types";
import { teamTodayISO } from "@/lib/leads/followUp";
import { AUTOMATED_LEAD_SOURCE, WEBSITE_LEAD_SOURCE } from "@/lib/store/types";
import { emailConfig } from "@/lib/email/config";
import { teamLocalToUtc } from "@/lib/email/merge";
import { LAST_STEP } from "./script";

// The demo's world. `seedTo(step)` wipes the demo schema and writes the state the walkthrough
// needs at that step: 0 is empty, 1..6 follow one website inquiry to a signed deal, and the last
// step adds a full working day around it. Times are relative to "now", so it never goes stale.
// Nothing here is a real person or company.

export const DEFAULT_COMPANY = "Northline Performance";
const PHONE = "(615) 555-0142";
const ADDRESS = "2200 Rosa L Parks Blvd, Nashville, TN 37228";
const OWNER = "Alex Morgan";
const DEMO_USER = "demo@golaunchcontrol.com";

type LeadPatch = Database["public"]["Tables"]["leads"]["Update"];
const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;
const ago = (now: Date, ms: number) => new Date(now.getTime() - ms).toISOString();
const isoDate = (now: Date, daysFromToday: number) => teamTodayISO(new Date(now.getTime() + daysFromToday * D), emailConfig.teamTimeZone);
/** A wall-clock time on the team's calendar (the server may run in UTC). */
const dayAt = (now: Date, daysFromToday: number, hour: number): string => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return teamLocalToUtc(isoDate(now, daysFromToday), time, emailConfig.teamTimeZone) ?? new Date(now).toISOString();
};

/** Tables the reset wipes, children first. crm_users, automation_settings and the company row stay. */
const WIPE = [
  "campaign_recipients", "email_campaigns", "email_drafts", "email_messages", "email_suppressions", "email_templates",
  "calendar_events", "tasks", "activity_log", "deals", "customers", "leads", "lead_gen_runs", "email_accounts",
] as const;

export function companyEmail(company: string): string {
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "company";
  return `hello@${slug}.com`;
}

function must<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data == null) throw new Error(`Couldn't write ${what}: ${result.error?.message ?? "no rows"}`);
  return result.data;
}

async function wipe(db: StoreClient): Promise<void> {
  for (const table of WIPE) {
    // Every row: suppressions key on email, everything else on a uuid id.
    const all = table === "email_suppressions" ? db.from(table).delete().neq("email", "") : db.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { error } = await all;
    if (error) throw new Error(`Couldn't clear ${table}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Walkthrough state (the one row of demo.demo_state; not in the generated types)

export interface DemoState { step: number; company: string }

function untyped(db: StoreClient): SupabaseClient {
  return db as unknown as SupabaseClient;
}

export async function readDemoState(db: StoreClient): Promise<DemoState> {
  const { data } = await untyped(db).from("demo_state").select("step, company").eq("id", true).maybeSingle();
  return { step: typeof data?.step === "number" ? data.step : 0, company: typeof data?.company === "string" && data.company ? data.company : DEFAULT_COMPANY };
}

async function writeDemoState(db: StoreClient, state: DemoState): Promise<void> {
  const { error } = await untyped(db).from("demo_state").upsert({ id: true, step: state.step, company: state.company, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Couldn't save the demo step: ${error.message}`);
}

// ---------------------------------------------------------------------------
// The one lead the walkthrough follows

const MARCUS = { name: "Marcus Bell", title: "Owner", business: "Bell Race Prep", email: "marcus@bellraceprep.com", phone: "(423) 555-0119",
  inquiry: "We need a better website and a way to keep up with bookings. Spring is our busy season and we're losing people who call when we're in the shop." };
const DEAL_VALUE = 18000;

interface World { now: Date; name: string; address: string; accountId: string }

function outbound(w: World, leadId: string, to: { email: string }, subject: string, body: string, at: string) {
  return { lead_id: leadId, account_id: w.accountId, direction: "out", folder: "sent", status: "sent", provider: "resend",
    from_address: w.address, from_name: w.name, to_address: to.email, subject, body_text: body, created_at: at, sent_by: DEMO_USER };
}
function inbound(w: World, leadId: string, from: { email: string; name: string }, subject: string, body: string, at: string, read: boolean) {
  return { lead_id: leadId, account_id: w.accountId, direction: "in", folder: "inbox", status: "received", provider: "resend",
    from_address: from.email, from_name: from.name, to_address: w.address, subject, body_text: body, created_at: at, read_at: read ? at : null };
}

/** Steps 1..6 of the story, as far as `step` goes. Returns the lead's id. */
async function seedStory(db: StoreClient, w: World, step: number): Promise<string> {
  const { now } = w;
  // Each beat happened a few minutes after the one before; the latest beat is "just now".
  const beat = (n: number) => ago(now, Math.max(0, step - n) * 4 * MIN + 1 * MIN);
  const lead = must(
    await db.from("leads").insert({ business_name: MARCUS.business, contact_name: MARCUS.name, contact_title: MARCUS.title, email: MARCUS.email, phone: MARCUS.phone,
      source: WEBSITE_LEAD_SOURCE, status: "new", notes: `Website inquiry: ${MARCUS.inquiry}`, created_at: beat(1), follow_up_on: isoDate(now, 0), next_action: "Reply to the website inquiry" }).select("id").single(),
    "the walkthrough lead",
  );
  const id = lead.id;
  const messages = [];
  if (step >= 2) messages.push(outbound(w, id, MARCUS, "Re: your inquiry", `Hi Marcus,\n\nThanks for reaching out. We build the website, the booking page and the follow-up system together, so the people who call while you're in the shop don't get lost.\n\nDo you have fifteen minutes this week for a call?\n\n${OWNER}`, beat(2)));
  if (step >= 3) messages.push(inbound(w, id, MARCUS, "Re: your inquiry", "Thanks for the quick reply. Tomorrow at 1:00 works if you're free. What do you need from me before then?", beat(3), step >= 4));
  if (step >= 4) messages.push(outbound(w, id, MARCUS, "Re: your inquiry", "1:00 tomorrow is on the calendar. Nothing to prepare; I'll ask a few questions about how bookings come in today.", beat(4)));
  if (step >= 5) messages.push(outbound(w, id, MARCUS, "Proposal: Bell Race Prep", `Hi Marcus,\n\nAttached is the proposal we talked through on the call: the new site, online booking and the follow-up system, live before spring.\n\n${OWNER}`, beat(5)));
  if (step >= 6) messages.push(inbound(w, id, MARCUS, "Re: Proposal: Bell Race Prep", "Let's do it. Signed copy attached. When can we start?", beat(6), true));
  if (messages.length) must(await db.from("email_messages").insert(messages).select("id"), "the walkthrough thread");

  if (step === 3) {
    must(await db.from("email_drafts").insert({ lead_id: id, kind: "reply", status: "pending", to_address: MARCUS.email, subject: "Re: your inquiry",
      body_text: "Hi Marcus, 1:00 tomorrow works. Nothing to prepare; I'll ask a few questions about how bookings come in today." }).select("id"), "the drafted reply");
  }
  if (step >= 4) {
    must(await db.from("calendar_events").insert({ title: `Call with ${MARCUS.name}`, starts_at: dayAt(now, 1, 13), ends_at: dayAt(now, 1, 13.5), lead_id: id,
      location: "Phone", notes: "How bookings come in today.", created_by: DEMO_USER, all_day: false }).select("id"), "the call");
  }
  if (step >= 5) {
    must(await db.from("deals").insert({ business_name: MARCUS.business, value: DEAL_VALUE, stage: step >= 6 ? "won" : "proposal", from_lead_id: id,
      notes: "Site, online booking, follow-up system. Live before spring.", created_at: beat(5) }).select("id"), "the deal");
  }
  if (step >= 6) {
    must(await db.from("customers").insert({ business_name: MARCUS.business, email: MARCUS.email, phone: MARCUS.phone, from_lead_id: id, notes: "Signed. Kickoff next week." }).select("id"), "the customer");
    must(await db.from("activity_log").insert({ action: "Deal won", entity_type: "deal", entity_id: id, entity_label: MARCUS.business, detail: `$${DEAL_VALUE.toLocaleString("en-US")}`, created_at: beat(6) }).select("id"), "activity");
  }

  // The triggers moved the lead as the thread landed; pin the state each step needs to show.
  const pin: Record<number, LeadPatch> = {
    1: { status: "new", awaiting: null, next_action: "Reply to the website inquiry" },
    2: { status: "contacted", awaiting: "them", status_reason: "First email sent", next_action: "Follow up if no reply" },
    3: { status: "replied", awaiting: "us", follow_up_on: isoDate(now, 0), status_reason: "They replied", next_action: "Confirm the call" },
    4: { status: "meeting", awaiting: "them", follow_up_on: isoDate(now, 1), status_reason: "Meeting booked", next_action: "Call tomorrow at 1:00" },
    5: { status: "proposal", awaiting: "them", status_reason: "Proposal sent", next_action: "Follow up on the proposal" },
    6: { status: "converted", awaiting: null, follow_up_on: null, status_reason: "Signed", next_action: "" },
  };
  must(await db.from("leads").update(pin[Math.min(step, 6)]).eq("id", id).select("id"), "the walkthrough lead's state");
  return id;
}

// ---------------------------------------------------------------------------
// A full working day around the story (the last step)

interface Person { key: string; name: string; title: string; business: string; email: string; phone: string; source: string; createdDaysAgo: number }

const PEOPLE: Person[] = [
  { key: "dana", name: "Dana Reyes", title: "Head of Events", business: "Ridge Motorsport", email: "dana@ridgemotorsport.com", phone: "(303) 555-0177", source: "Referral", createdDaysAgo: 12 },
  { key: "kevin", name: "Kevin Osei", title: "Owner", business: "Apex Track Days", email: "kevin@apextrackdays.com", phone: "(704) 555-0134", source: "Referral", createdDaysAgo: 6 },
  { key: "sofia", name: "Sofia Laurent", title: "General Manager", business: "Coastline Karting", email: "sofia@coastlinekarting.com", phone: "(843) 555-0160", source: "Trade show", createdDaysAgo: 14 },
  { key: "jen", name: "Jen Takahashi", title: "Director", business: "Summit Driving Club", email: "jen@summitdrivingclub.com", phone: "(720) 555-0188", source: "Referral", createdDaysAgo: 2 },
  { key: "tom", name: "Tom Alvarez", title: "Owner", business: "Alvarez Collision Center", email: "tom@alvarezcollision.com", phone: "(615) 555-0151", source: "Networking", createdDaysAgo: 20 },
  { key: "linda", name: "Linda Park", title: "Marketing Director", business: "Park Auto Group", email: "linda@parkautogroup.com", phone: "(615) 555-0126", source: "Referral", createdDaysAgo: 30 },
  { key: "greg", name: "Greg Hollis", title: "Owner", business: "Hollis Tire & Wheel", email: "greg@hollistire.com", phone: "(931) 555-0143", source: "Cold email", createdDaysAgo: 25 },
  { key: "rae", name: "Rae Whitfield", title: "Owner", business: "Whitfield Logistics", email: "rae@whitfieldlogistics.com", phone: "(629) 555-0107", source: WEBSITE_LEAD_SOURCE, createdDaysAgo: 0 },
];

const PROSPECTS = [
  { business: "Harbor Point Marina", email: "info@harborpointmarina.com", website: "https://harborpointmarina.example", domain: "harborpointmarina.com", segment: "Marinas", city: "Panama City", state: "FL", score: 84,
    reason: "Busy marina with an old site and no online booking.", hook: "Your slip reservations still go through a phone call; a booking page would fill the summer calendar." },
  { business: "Ironwood Fabrication", email: "office@ironwoodfab.com", website: "https://ironwoodfab.example", domain: "ironwoodfab.com", segment: "Metal fabrication", city: "Chattanooga", state: "TN", score: 71,
    reason: "Growing shop, hiring, no way to request a quote online.", hook: "Quote requests by email get lost; a form that lands in a pipeline would not." },
];

async function seedWorld(db: StoreClient, w: World): Promise<void> {
  const { now, name } = w;
  const leadRows = must(
    await db.from("leads").insert([
      ...PEOPLE.map((p) => ({ business_name: p.business, email: p.email, phone: p.phone, contact_name: p.name, contact_title: p.title, source: p.source, status: "new",
        notes: p.key === "rae" ? "Website inquiry: We're adding trucks this year and our dispatch runs on a whiteboard. Need something better." : "",
        created_at: p.createdDaysAgo ? ago(now, p.createdDaysAgo * D) : ago(now, 2 * H) })),
      ...PROSPECTS.map((p) => ({ business_name: p.business, email: p.email, phone: "", source: AUTOMATED_LEAD_SOURCE, status: "new", website: p.website, domain: p.domain,
        segment: p.segment, city: p.city, state: p.state, score: p.score, score_reason: p.reason, outreach_hook: p.hook, scored_at: ago(now, 1 * D), created_at: ago(now, 1 * D), notes: "" })),
    ]).select("id, email"),
    "leads",
  );
  const id = Object.fromEntries(PEOPLE.map((p) => [p.key, leadRows.find((r) => r.email === p.email)!.id]));
  const who = Object.fromEntries(PEOPLE.map((p) => [p.key, p]));
  const out = (key: string, subject: string, body: string, at: string) => outbound(w, id[key], who[key], subject, body, at);
  const inb = (key: string, subject: string, body: string, at: string, read: boolean) => inbound(w, id[key], who[key], subject, body, at, read);

  const messages = must(
    await db.from("email_messages").insert([
      out("dana", "Proposal for the 2027 season", `Hi Dana,\n\nAttached is the proposal we talked through: the new site, the booking flow and the sponsor pages, live before your first event.\n\n${OWNER}`, ago(now, 10 * D)),
      inb("dana", "Re: Proposal for the 2027 season", "Looks great. Can you price it for three cars, not two? We'd want it live before the March opener.", ago(now, 19 * H), false),
      out("kevin", "Intro call this week?", `Hi Kevin,\n\nThanks for the intro from Dana. Happy to walk you through what we built for Ridge. Does Thursday at 1:00 work?\n\n${OWNER}`, ago(now, 5 * D)),
      inb("kevin", "Re: Intro call this week?", "Confirmed for 1:00. Who else should join from your side?", ago(now, 3 * H), false),
      inb("sofia", "Re: Coastline Karting", "Send the proposal over and I'll take a look with my partner.", ago(now, 12 * D), true),
      out("sofia", "Proposal: Coastline Karting", `Hi Sofia,\n\nHere is the proposal we discussed. The booking page and the membership flow are the two pieces that pay for themselves first.\n\n${OWNER}`, ago(now, 9 * D)),
      out("sofia", "Re: Proposal: Coastline Karting", "Hi Sofia, checking in on the proposal. Happy to answer anything on a quick call.", ago(now, 5 * D)),
      out("jen", "Summit Driving Club", `Hi Jen,\n\nGreat meeting you at the track on Saturday. Here's a short look at what we do for clubs like yours.\n\n${OWNER}`, ago(now, 1 * D)),
      inb("tom", "Re: Revised terms", "Can we do net 30 on the second half? Otherwise we're good to go.", ago(now, 4 * D), true),
      out("tom", "Re: Revised terms", "Net 30 on the second half works. I'll send the revised agreement by Friday.", ago(now, 2 * D)),
      out("linda", "Welcome aboard", "Linda, thank you. Kickoff is Tuesday at 10; I'll send the plan ahead of it.", ago(now, 8 * D)),
      out("greg", "Hollis Tire & Wheel", "Hi Greg, following up on the quote from last week. Any questions I can answer?", ago(now, 16 * D)),
      inb("greg", "Re: Hollis Tire & Wheel", "Thanks, but we decided to go with another vendor this year.", ago(now, 15 * D), true),
    ]).select("id, lead_id, direction, created_at"),
    "messages",
  );
  const lastInbound = (key: string) => messages.filter((m) => m.lead_id === id[key] && m.direction === "in").sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id ?? null;

  must(
    await db.from("email_drafts").insert([
      { lead_id: id.dana, kind: "reply", status: "pending", to_address: who.dana.email, subject: "Re: Proposal for the 2027 season", reply_to_message_id: lastInbound("dana"),
        body_text: "Hi Dana, three cars works. The package moves to $48,000 and still goes live before the March opener. I've updated the proposal and we can walk through it Thursday." },
      { lead_id: id.kevin, kind: "reply", status: "pending", to_address: who.kevin.email, subject: "Re: Intro call this week?", reply_to_message_id: lastInbound("kevin"),
        body_text: "Hi Kevin, it'll be me and our builder, who puts the systems together. Looking forward to it at 1:00." },
      { lead_id: id.sofia, kind: "follow_up", follow_up_number: 2, status: "pending", to_address: who.sofia.email, subject: "Re: Proposal: Coastline Karting",
        body_text: "Hi Sofia, happy to walk through any part of the proposal on a quick call this week. Does Thursday work?" },
    ]).select("id"),
    "drafts",
  );
  must(
    await db.from("deals").insert([
      { business_name: who.dana.business, value: 48000, stage: "proposal", from_lead_id: id.dana, notes: "Three cars, live before the March opener.", created_at: ago(now, 10 * D) },
      { business_name: who.kevin.business, value: 22500, stage: "inquiry", from_lead_id: id.kevin, notes: "Referred by Dana Reyes.", created_at: ago(now, 5 * D) },
      { business_name: who.sofia.business, value: 16000, stage: "proposal", from_lead_id: id.sofia, notes: "Booking page plus membership flow.", created_at: ago(now, 9 * D) },
      { business_name: who.tom.business, value: 31000, stage: "negotiation", from_lead_id: id.tom, notes: "Net 30 on the second half agreed.", created_at: ago(now, 12 * D) },
      { business_name: who.linda.business, value: 12000, stage: "won", from_lead_id: id.linda, notes: "Kickoff Tuesday.", created_at: ago(now, 20 * D) },
      { business_name: who.greg.business, value: 9000, stage: "lost", from_lead_id: id.greg, notes: "Went with another vendor.", created_at: ago(now, 22 * D) },
    ]).select("id"),
    "deals",
  );
  must(await db.from("customers").insert({ business_name: who.linda.business, email: who.linda.email, phone: who.linda.phone, from_lead_id: id.linda, notes: "Site, CRM and outreach. Kickoff Tuesday 10:00." }).select("id"), "customer");
  must(
    await db.from("calendar_events").insert([
      { title: `Intro call with ${who.kevin.name}`, starts_at: dayAt(now, 0, 13), ends_at: dayAt(now, 0, 13.5), lead_id: id.kevin, location: "Phone", notes: "", created_by: DEMO_USER, all_day: false },
      { title: "Weekly pipeline review", starts_at: dayAt(now, 0, 16), ends_at: dayAt(now, 0, 16.5), location: "Office", notes: "", created_by: DEMO_USER, all_day: false },
      { title: `Kickoff: ${who.linda.business}`, starts_at: dayAt(now, 1, 10), ends_at: dayAt(now, 1, 11), lead_id: id.linda, location: who.linda.business, notes: "", created_by: DEMO_USER, all_day: false },
    ]).select("id"),
    "events",
  );
  must(
    await db.from("tasks").insert([
      { title: "Send Dana the three-car pricing", due_date: isoDate(now, 0), done: false, related_type: "lead", related_id: id.dana, related_label: who.dana.business },
      { title: "Prep for Kevin's 1:00", due_date: isoDate(now, 0), done: false, related_type: "lead", related_id: id.kevin, related_label: who.kevin.business },
      { title: "Send Tom the revised agreement", due_date: isoDate(now, 2), done: false, related_type: "lead", related_id: id.tom, related_label: who.tom.business },
      { title: "Welcome packet for Park Auto Group", due_date: isoDate(now, -1), done: true, related_type: "lead", related_id: id.linda, related_label: who.linda.business },
    ]).select("id"),
    "tasks",
  );
  must(
    await db.from("email_templates").insert([
      { name: "Reply to a website inquiry", subject: "Re: your inquiry", body_text: `Hi {{first_name}},\n\nThanks for reaching out. We build the website, the booking page and the follow-up system together, so the people who call while you're busy don't get lost.\n\nDo you have fifteen minutes this week for a call?` },
      { name: "Intro after a referral", subject: `Quick intro from ${name}`, body_text: "Hi {{first_name}},\n\n{{referrer}} suggested we talk. We build the website, the booking flow and the follow-up system so new customers stop slipping through.\n\nWorth a fifteen-minute call this week?" },
      { name: "Proposal check-in", subject: "Re: Proposal", body_text: "Hi {{first_name}},\n\nChecking in on the proposal. Happy to walk through any part of it on a quick call." },
    ]).select("id"),
    "templates",
  );
  must(
    await db.from("activity_log").insert([
      { action: "Deal won", entity_type: "deal", entity_id: id.linda, entity_label: who.linda.business, detail: "$12,000", created_at: ago(now, 8 * D) },
      { action: "Deal lost", entity_type: "deal", entity_id: id.greg, entity_label: who.greg.business, detail: "Went with another vendor", created_at: ago(now, 15 * D) },
      { action: "Meeting booked", entity_type: "lead", entity_id: id.kevin, entity_label: who.kevin.business, detail: "Intro call, today 1:00", created_at: ago(now, 3 * H) },
    ]).select("id"),
    "activity",
  );

  const today = isoDate(now, 0);
  const pin = async (key: string, patch: LeadPatch) => must(await db.from("leads").update(patch).eq("id", id[key]).select("id"), `lead ${key}`);
  await pin("dana", { status: "proposal", awaiting: "us", follow_up_on: today, next_action: "Reply with three-car pricing", status_reason: "Proposal sent", last_reply_at: ago(now, 19 * H), last_contacted_at: ago(now, 10 * D) });
  await pin("kevin", { status: "meeting", awaiting: "us", follow_up_on: today, next_action: "Confirm who joins the 1:00", status_reason: "Meeting booked", last_reply_at: ago(now, 3 * H), last_contacted_at: ago(now, 5 * D) });
  await pin("sofia", { status: "proposal", awaiting: "them", follow_up_on: today, follow_up_count: 1, next_action: "Second follow-up on the proposal", status_reason: "Proposal sent", last_contacted_at: ago(now, 5 * D), last_reply_at: ago(now, 12 * D) });
  await pin("rae", { status: "new", awaiting: null, follow_up_on: today, next_action: "Reply to the website inquiry", last_contacted_at: null });
  await pin("jen", { status: "contacted", awaiting: "them", follow_up_on: isoDate(now, 2), next_action: "Follow up if no reply", status_reason: "First email sent", last_contacted_at: ago(now, 1 * D) });
  await pin("tom", { status: "negotiation", awaiting: "them", follow_up_on: isoDate(now, 2), next_action: "Send the revised agreement", status_reason: "Negotiating terms", last_contacted_at: ago(now, 2 * D), last_reply_at: ago(now, 4 * D) });
  await pin("linda", { status: "converted", awaiting: null, follow_up_on: null, next_action: "", status_reason: "Signed", last_contacted_at: ago(now, 8 * D) });
  await pin("greg", { status: "lost", awaiting: null, follow_up_on: null, next_action: "", status_reason: "Went with another vendor", last_contacted_at: ago(now, 16 * D), last_reply_at: ago(now, 15 * D) });
  // Status changes above stamped "changed just now"; put the dates back where the story has them.
  await pin("dana", { status_changed_at: ago(now, 10 * D) });
  await pin("kevin", { status_changed_at: ago(now, 3 * H) });
  await pin("sofia", { status_changed_at: ago(now, 9 * D) });
  await pin("tom", { status_changed_at: ago(now, 4 * D) });
  await pin("linda", { status_changed_at: ago(now, 8 * D) });
  await pin("greg", { status_changed_at: ago(now, 15 * D) });
}

// ---------------------------------------------------------------------------

/** Wipes the demo and writes the state for `step` (0 = empty, LAST_STEP = a full day). Returns the walkthrough lead's id, if it exists yet. */
export async function seedTo(db: StoreClient, step: number, company: string = DEFAULT_COMPANY, now: Date = new Date()): Promise<{ step: number; leadId: string | null }> {
  const target = Math.max(0, Math.min(LAST_STEP, Math.floor(step)));
  const name = company.trim().slice(0, 60) || DEFAULT_COMPANY;
  const address = companyEmail(name);
  await wipe(db);
  must(await db.from("company_info").update({ name, email: address, phone: PHONE, address: ADDRESS }).eq("id", true).select("id"), "company");
  const account = must(
    await db.from("email_accounts").insert({ address, display_name: name, provider: "resend", status: "active", connected_by: DEMO_USER,
      signature_name: OWNER, signature_title: "Owner", signature_phone: PHONE }).select("id").single(),
    "email account",
  );
  const w: World = { now, name, address, accountId: account.id };
  const leadId = target >= 1 ? await seedStory(db, w, target) : null;
  if (target === LAST_STEP) await seedWorld(db, w);
  await writeDemoState(db, { step: target, company: name });
  return { step: target, leadId };
}
