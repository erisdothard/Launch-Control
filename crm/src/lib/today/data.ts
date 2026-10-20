// Everything the Today page shows, fetched once per request. The nav badge counts the same queue
// through `queueFor`, so the number in the sidebar always matches what the page lists.
import { getLeads } from "@/lib/store/leads";
import { getCustomers } from "@/lib/store/customers";
import { getEvents } from "@/lib/store/calendar";
import { getPendingDrafts, type EmailDraft } from "@/lib/store/drafts";
import { getInbox, getThread, type InboxRow } from "@/lib/store/messages";
import { matchesView, WEBSITE_LEAD_SOURCE, type CalendarEvent, type Lead } from "@/lib/store/types";
import { outlookOnlyEvents } from "@/lib/email/outlookCalendar";
import { emailConfig } from "@/lib/email/config";
import { teamTodayISO } from "@/lib/leads/followUp";
import { leadState } from "@/lib/leads/state";
import { addDaysISO, type FollowUpItem, type InquiryItem, type MeetingItem, type ReplyItem, type TodayData } from "./types";

export type { TodayData } from "./types";

export const MAX_REPLY_CARDS = 10;
const SNIPPET_MAX = 1200;

interface Queue {
  replyLeads: Lead[];
  followUpLeads: Lead[];
  inquiryLeads: Lead[];
  /** Pending drafts whose lead is not already on a reply or follow-up card. */
  waitingDrafts: EmailDraft[];
  replyDraftFor: Map<string, EmailDraft>;
  followUpDraftFor: Map<string, EmailDraft>;
}

function isOpen(lead: Lead): boolean {
  return lead.status !== "converted" && lead.status !== "lost" && !lead.doNotContact;
}

/** The lead ids that need a person today, each in one section only. Pure, so the badge can share it. */
export function queueFor(leads: readonly Lead[], inbox: readonly InboxRow[], drafts: readonly EmailDraft[], today: string): Queue {
  const byId = new Map(leads.map((l) => [l.id, l]));
  const seen = new Set<string>();
  const take = (lead: Lead | undefined): lead is Lead => {
    if (!lead || seen.has(lead.id)) return false;
    seen.add(lead.id);
    return true;
  };

  const needsReply = leads.filter((l) => matchesView(l, "needs-reply", today));
  const unreadLeads = inbox.filter((r) => r.unread > 0).map((r) => byId.get(r.leadId));
  const replyLeads = [...needsReply, ...unreadLeads].filter(take).sort((a, b) => (b.lastReplyAt ?? "").localeCompare(a.lastReplyAt ?? ""));

  const followUpLeads = leads
    .filter((l) => matchesView(l, "follow-up", today) || (isOpen(l) && l.followUpOn !== null && l.followUpOn <= today))
    .filter(take)
    .sort((a, b) => (a.followUpOn ?? "").localeCompare(b.followUpOn ?? ""));

  const inquiryLeads = leads.filter((l) => l.source === WEBSITE_LEAD_SOURCE && l.status === "new").filter(take);

  const replyDraftFor = new Map(drafts.filter((d) => d.kind === "reply").map((d) => [d.leadId, d]));
  const followUpDraftFor = new Map(drafts.filter((d) => d.kind === "follow_up").map((d) => [d.leadId, d]));
  const replyIds = new Set(replyLeads.map((l) => l.id));
  const followUpIds = new Set(followUpLeads.map((l) => l.id));
  const waitingDrafts = drafts.filter((d) => {
    if (d.kind === "reply") return replyDraftFor.get(d.leadId) !== d || !replyIds.has(d.leadId);
    return followUpDraftFor.get(d.leadId) !== d || !followUpIds.has(d.leadId);
  });

  return { replyLeads, followUpLeads, inquiryLeads, waitingDrafts, replyDraftFor, followUpDraftFor };
}

export function attentionOf(q: Queue): number {
  return q.replyLeads.length + q.followUpLeads.length + q.inquiryLeads.length + q.waitingDrafts.length;
}

/* ---- team day helpers ---- */

function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - date.getTime();
}

/** The instant the team's calendar day starts. */
function teamDayStart(day: string, timeZone: string): Date {
  const guess = new Date(`${day}T00:00:00Z`);
  return new Date(guess.getTime() - zoneOffsetMs(guess, timeZone));
}

function dateInWords(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" }).format(now);
}

const URL_RE = /^https?:\/\/\S+$/i;

function joinUrl(e: CalendarEvent): string | null {
  if (URL_RE.test(e.location.trim())) return e.location.trim();
  return e.outlookLink ?? null;
}

/** Whether an event touches the team's day [start, end). Outlook all-day events carry zone-less local days. */
function onTeamDay(e: CalendarEvent, today: string, start: Date, end: Date): boolean {
  if (e.allDay && e.id.startsWith("outlook-")) return e.startsAt.slice(0, 10) <= today && today < e.endsAt.slice(0, 10);
  const s = new Date(e.startsAt).getTime();
  const en = new Date(e.endsAt).getTime();
  return s < end.getTime() && en > start.getTime();
}

function cleanSnippet(text: string): string {
  const flat = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return flat.length > SNIPPET_MAX ? `${flat.slice(0, SNIPPET_MAX).trimEnd()}…` : flat;
}

async function replyItemFor(lead: Lead, draft: EmailDraft | undefined): Promise<ReplyItem> {
  const thread = await getThread(lead.id);
  const last = [...thread].reverse().find((m) => m.direction === "in");
  return {
    leadId: lead.id,
    businessName: lead.businessName,
    contactName: lead.prospect?.contactName ?? null,
    wroteAt: last?.createdAt ?? lead.lastReplyAt,
    wroteSubject: last?.subject ?? "",
    snippet: last ? cleanSnippet(last.bodyText) : "",
    draft: draft ? { id: draft.id, body: draft.body } : null,
  };
}

export async function getTodayData(now: Date = new Date()): Promise<TodayData> {
  const timeZone = emailConfig.teamTimeZone;
  const today = teamTodayISO(now, timeZone);
  const start = teamDayStart(today, timeZone);
  const end = teamDayStart(addDaysISO(today, 1), timeZone);
  // Pad the query a day each side so a zone-less all-day row isn't lost, then keep what's on the day.
  const from = new Date(start.getTime() - 86_400_000).toISOString();
  const to = new Date(end.getTime() + 86_400_000).toISOString();

  const [leads, inbox, drafts, customers, crmEvents] = await Promise.all([getLeads(), getInbox(), getPendingDrafts(), getCustomers(), getEvents(from, to)]);
  const outlook = await outlookOnlyEvents(from, to, new Set(crmEvents.flatMap((e) => (e.outlookEventId ? [e.outlookEventId] : []))));
  const leadName = new Map(leads.map((l) => [l.id, l.businessName]));

  const meetings = [...crmEvents, ...outlook.events]
    .filter((e) => onTeamDay(e, today, start, end))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startsAt.localeCompare(b.startsAt))
    .map<MeetingItem>((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      allDay: e.allDay,
      leadId: e.leadId,
      leadName: e.leadId ? (leadName.get(e.leadId) ?? null) : null,
      joinUrl: joinUrl(e),
      location: e.location,
    }));

  const q = queueFor(leads, inbox, drafts, today);
  const replies = await Promise.all(q.replyLeads.slice(0, MAX_REPLY_CARDS).map((l) => replyItemFor(l, q.replyDraftFor.get(l.id))));

  const followUps = q.followUpLeads.map<FollowUpItem>((l) => {
    const d = q.followUpDraftFor.get(l.id);
    return {
      leadId: l.id,
      businessName: l.businessName,
      line: leadState(l, today).line,
      nextAction: l.nextAction,
      followUpOn: l.followUpOn,
      draft: d ? { id: d.id, subject: d.subject, body: d.body } : null,
    };
  });

  const inquiries = q.inquiryLeads.map<InquiryItem>((l) => ({
    leadId: l.id,
    businessName: l.businessName,
    email: l.email,
    phone: l.phone,
    note: l.notes.split("\n").find((line) => line.trim()) ?? "",
  }));

  return {
    today,
    dateLabel: dateInWords(now, timeZone),
    meetings,
    outlookError: outlook.error,
    replies,
    moreReplies: Math.max(0, q.replyLeads.length - replies.length),
    followUps,
    inquiries,
    waitingDrafts: q.waitingDrafts,
    pipeline: {
      leads: leads.length,
      customers: customers.length,
      hotProspects: leads.filter((l) => (l.prospect?.score ?? 0) >= 80 && l.status === "new").length,
    },
    attention: attentionOf(q),
  };
}
