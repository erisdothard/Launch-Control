// One plain-English line per lead and the one thing to do about it. The Leads list, the lead page
// and the Today queue all read this, so a lead says the same thing everywhere.
//
// Pure: takes the lead and the team's calendar day (teamTodayISO) and formats dates in the team's
// zone, so a server render and a client render agree.

import type { Lead } from "@/lib/store/types";
import { AUTOMATED_LEAD_SOURCE, WEBSITE_LEAD_SOURCE } from "@/lib/store/types";

export type LeadAction = "reply" | "email" | "follow-up" | "call" | "none";

export type LeadTone = "urgent" | "due" | "waiting" | "quiet" | "won" | "closed";

export interface LeadState {
  /** What is going on, as a sentence. "They replied Oct 19. You owe them a reply." */
  line: string;
  /** The one button the row shows. */
  action: LeadAction;
  actionLabel: string;
  tone: LeadTone;
}

const TEAM_ZONE = "America/Chicago";

/** "Oct 19" in the team's zone. Accepts ISO timestamps and YYYY-MM-DD dates. */
export function shortDate(iso: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return new Intl.DateTimeFormat("en-US", { timeZone: TEAM_ZONE, month: "short", day: "numeric" }).format(d);
}

function dueWord(followUpOn: string, today: string): string {
  if (followUpOn < today) return `was due ${shortDate(followUpOn)}`;
  if (followUpOn === today) return "is due today";
  return `is ${shortDate(followUpOn)}`;
}

function reach(lead: Lead): { action: LeadAction; actionLabel: string } {
  if (lead.email) return { action: "email", actionLabel: "Email" };
  if (lead.phone) return { action: "call", actionLabel: "Call" };
  return { action: "none", actionLabel: "" };
}

export function leadState(lead: Lead, today: string): LeadState {
  if (lead.status === "converted") {
    const since = lead.statusChangedAt ? ` since ${shortDate(lead.statusChangedAt)}` : "";
    return { line: `Customer${since}.`, action: "none", actionLabel: "", tone: "won" };
  }
  if (lead.doNotContact) {
    return { line: "Asked not to be contacted.", action: "none", actionLabel: "", tone: "closed" };
  }
  if (lead.status === "lost") {
    return { line: lead.statusReason || "Closed.", action: "none", actionLabel: "", tone: "closed" };
  }

  const next = lead.nextAction ? ` Next: ${lead.nextAction}.` : "";

  if (lead.awaiting === "us") {
    const when = lead.lastReplyAt ? ` ${shortDate(lead.lastReplyAt)}` : "";
    return { line: `They replied${when}. You owe them a reply.${next}`, action: "reply", actionLabel: "Reply", tone: "urgent" };
  }

  if (lead.status === "meeting" || lead.status === "proposal" || lead.status === "negotiation") {
    const what = lead.statusReason || (lead.status === "meeting" ? "Meeting booked" : lead.status === "proposal" ? "Proposal out" : "Negotiating");
    if (lead.followUpOn && lead.followUpOn <= today) {
      return { line: `${what}. Follow-up ${dueWord(lead.followUpOn, today)}.${next}`, action: "follow-up", actionLabel: "Follow up", tone: "due" };
    }
    return { line: `${what}.${next}`, ...reach(lead), tone: "waiting" };
  }

  if (lead.awaiting === "them") {
    const since = lead.lastContactedAt ? ` since ${shortDate(lead.lastContactedAt)}` : "";
    if (lead.followUpOn && lead.followUpOn <= today) {
      return { line: `No answer${since}. Follow-up ${dueWord(lead.followUpOn, today)}.${next}`, action: "follow-up", actionLabel: "Follow up", tone: "due" };
    }
    const planned = lead.followUpOn ? ` Follow-up ${dueWord(lead.followUpOn, today)}.` : "";
    return { line: `Waiting on them${since}.${planned}${next}`, action: "none", actionLabel: "", tone: "waiting" };
  }

  // Nobody has emailed them yet.
  if (lead.followUpOn && lead.followUpOn <= today) {
    return { line: `Not contacted yet. Follow-up ${dueWord(lead.followUpOn, today)}.${next}`, ...reach(lead), tone: "due" };
  }
  if (lead.source === WEBSITE_LEAD_SOURCE) {
    const r = reach(lead);
    return { line: `New inquiry from the website ${shortDate(lead.createdAt)}.${next}`, ...r, tone: r.action === "none" ? "quiet" : "urgent" };
  }
  const r = reach(lead);
  const added = lead.source === AUTOMATED_LEAD_SOURCE ? `Found by Lead Gen ${shortDate(lead.createdAt)}.` : `Added ${shortDate(lead.createdAt)}.`;
  const line = r.action === "none" ? `${added} No email or phone on file.` : `${added}${next}`;
  return { line, ...r, tone: "quiet" };
}

/** Pill classes for a tone, from globals.css. */
export function toneClass(tone: LeadTone): string {
  switch (tone) {
    case "urgent":
      return "pill pill-danger";
    case "due":
      return "pill pill-warn";
    case "waiting":
      return "pill pill-info";
    case "won":
      return "pill pill-ok";
    case "closed":
      return "pill pill-neutral";
    case "quiet":
      return "pill pill-neutral";
  }
}

/** The short status word a pill shows next to the line. */
export function toneLabel(lead: Lead, state: LeadState): string {
  switch (state.tone) {
    case "urgent":
      return lead.awaiting === "us" ? "Needs reply" : "New inquiry";
    case "due":
      return "Follow-up due";
    case "waiting":
      return lead.status === "meeting" ? "Meeting" : lead.status === "proposal" ? "Proposal" : lead.status === "negotiation" ? "Negotiating" : "Waiting";
    case "won":
      return "Customer";
    case "closed":
      return "Closed";
    case "quiet":
      return "Not contacted";
  }
}
