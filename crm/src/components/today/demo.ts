import { clockTime, greetingFor, type TodayData, type TodayItem } from "@/lib/store/today";

// Invented people and companies, for looking at the populated Today screen in development
// (`/admin/dashboard?demo=1`). Never rendered in production; sends in demo mode never reach the server.

const H = 60 * 60 * 1000;

function at(now: Date, hoursFromNow: number): string {
  return new Date(now.getTime() + hoursFromNow * H).toISOString();
}

export function demoToday(now: Date = new Date()): TodayData {
  const items: TodayItem[] = [
    {
      key: "demo-dana", leadId: "demo-dana", kind: "reply", tone: "hot", action: "send",
      draft: { id: "demo-d1", subject: "Re: Proposal", to: "dana@example.com", body: "Hi Dana, three cars works. The package moves to $48,000 and still goes live before the March opener. I've updated the proposal and we can walk through it Thursday." },
      name: "Dana Reyes", firstName: "Dana", initials: "DR", company: "Ridge Motorsport", role: "Head of Events",
      value: 48000, phone: "", email: "dana@example.com", waitLabel: "Waiting 19 hours",
      quote: { text: "Looks great. Can you price it for three cars, not two? We'd want it live before the March opener.", said: "Dana, yesterday 3:14pm" },
      note: null, summary: "Wrote: “Looks great. Can you price it for three cars, not two?”", meta: ["Waiting 19 hours", "Reply drafted"],
      startHint: "Start with Dana, who has been waiting 19 hours.", error: null,
    },
    {
      key: "demo-kevin", leadId: "demo-kevin", kind: "reply", tone: "hot", action: "send",
      draft: { id: "demo-d2", subject: "Re: Intro call", to: "kevin@example.com", body: "Hi Kevin, it'll be me and Eris, who builds the systems. Looking forward to it at 1:00." },
      name: "Kevin Osei", firstName: "Kevin", initials: "KO", company: "Apex Track Days", role: "Owner",
      value: 22500, phone: "", email: "kevin@example.com", waitLabel: "Waiting 3 hours",
      quote: { text: "Confirmed for 1:00. Who else should join from your side?", said: "Kevin, today 7:40am" },
      note: null, summary: "Wrote: “Confirmed for 1:00. Who else should join from your side?”", meta: ["Waiting 3 hours", "Reply drafted"],
      startHint: "Start with Kevin; your call is at 1:00.", error: null,
    },
    {
      key: "demo-sofia", leadId: "demo-sofia", kind: "followup", tone: "warm", action: "send",
      draft: { id: "demo-d3", subject: "Re: Proposal", to: "sofia@example.com", body: "Hi Sofia, happy to walk through any of the proposal on a quick call this week. Does Thursday work?" },
      name: "Sofia Laurent", firstName: "Sofia", initials: "SL", company: "Coastline Karting", role: "General Manager",
      value: 16000, phone: "", email: "sofia@example.com", waitLabel: "Follow-up due today",
      quote: null, note: { text: "Proposal went out Friday and she hasn't replied.", said: "Second follow-up · You last wrote Friday 10:12am" },
      summary: "Proposal went out Friday, no reply. Second follow-up is due today.", meta: ["Follow-up due today", "Follow-up drafted"],
      startHint: "Start with Sofia; the follow-up is due today.", error: null,
    },
    {
      key: "demo-marcus", leadId: "demo-marcus", kind: "followup", tone: "warm", action: "call",
      draft: null, name: "Marcus Bell", firstName: "Marcus", initials: "MB", company: "Bell Race Prep", role: "Owner",
      value: 12000, phone: "(310) 555-0192", email: "", waitLabel: "Follow-up due today",
      quote: null, note: { text: "Call after the season finale. That was Sunday.", said: "(310) 555-0192" },
      summary: "Call after the season finale. That was Sunday.", meta: ["Follow-up due today", "(310) 555-0192"],
      startHint: "Start with Marcus; the follow-up is due today.", error: null,
    },
    {
      key: "demo-jen", leadId: "demo-jen", kind: "new", tone: "new", action: "write",
      draft: null, name: "Jen Takahashi", firstName: "Jen", initials: "JT", company: "Summit Driving Club", role: null,
      value: null, phone: "", email: "jen@example.com", waitLabel: "Came in 7:58am",
      quote: { text: "Need a site and bookings before spring. Budget $10–30k.", said: "Website form, today 7:58am" },
      note: null, summary: "New website inquiry: “Need a site and bookings before spring.” Budget $10–30k.", meta: ["Website, 7:58am"],
      startHint: "Start with Jen, who came in today.", error: null,
    },
  ];
  const ev = (id: string, title: string, who: string, h: number) => ({
    id, title, who, startsAt: at(now, h), endsAt: at(now, h + 0.5), allDay: false, time: clockTime(at(now, h)),
  });
  return {
    greeting: greetingFor(now),
    firstName: "Max",
    items,
    agenda: [ev("e1", "Team sync", "Max, Eris", -1.7), ev("e2", "Intro · Apex Track Days", "Kevin Osei · Google Meet", 2.3), ev("e3", "Proposal · Ridge Motorsport", "Dana Reyes · Zoom", 5.8)],
    figures: {
      openTotal: 214500,
      stages: [
        { stage: "proposal", label: "Proposal out", total: 96000, count: 4 },
        { stage: "negotiation", label: "Negotiating", total: 78000, count: 2 },
        { stage: "inquiry", label: "Talking", total: 40500, count: 5 },
      ],
      wonQuarter: { total: 62000, count: 3, quarterLabel: "Q4" },
      replyRate: { pct: 24, replied: 12, emailed: 50 },
    },
    nowISO: now.toISOString(),
    demo: true,
  };
}
