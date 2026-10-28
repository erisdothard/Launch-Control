import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getToday, TEAM_TIME_ZONE, type TodayData } from "@/lib/store/today";
import TodayBoard from "@/components/today/TodayBoard";
import type { GlanceStat } from "@/components/today/TodayHead";
import { money } from "@/components/today/shared";
import { demoToday } from "@/components/today/demo";
import { DEMO_ACCOUNTS } from "@/components/inbox/demo";
import { getEmailAccounts, type EmailAccount } from "@/lib/store/messages";

// Today: everything waiting on Max, grouped, with a slim strip of the day's figures.
// `?demo=1` swaps in invented data to look at the populated screen; development only.

function nextMeeting(data: TodayData) {
  const now = new Date(data.nowISO).getTime();
  return data.agenda.find((e) => !e.allDay && new Date(e.startsAt).getTime() > now) ?? null;
}

function nextUpLine(data: TodayData): string | null {
  const next = nextMeeting(data);
  return next ? `Next up is ${next.title} at ${next.time}.` : null;
}

/** "4:30pm" in team time. */
function clock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TEAM_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date(iso))
    .replace(/\s?([AP])M$/i, (_, p: string) => `${p.toLowerCase()}m`);
}

// The header strip. Anything zero or empty is left out instead of shown as "$0" or "Nothing".
function glance(data: TodayData): GlanceStat[] {
  const { figures } = data;
  const next = nextMeeting(data);
  const meetings = data.agenda.filter((e) => !e.allDay).length;
  const stats: (GlanceStat | null)[] = [
    next ? { label: "Next meeting", value: clock(next.startsAt), small: next.title.split(" · ").pop() } : null,
    meetings ? { label: "Meetings today", value: String(meetings) } : null,
    figures.openTotal > 0 ? { label: "Open deals", value: money(figures.openTotal) } : null,
    figures.wonQuarter.total > 0 ? { label: "Won this quarter", value: money(figures.wonQuarter.total) } : null,
    figures.replyRate && figures.replyRate.replied > 0 ? { label: "Reply rate, 30 days", value: `${figures.replyRate.pct}%`, small: `${figures.replyRate.replied} of ${figures.replyRate.emailed}` } : null,
  ];
  return stats.filter((s): s is GlanceStat => s !== null);
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  let data: TodayData;
  let accounts: EmailAccount[];
  if (demo === "1" && process.env.NODE_ENV !== "production") {
    data = demoToday();
    accounts = DEMO_ACCOUNTS;
  } else {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    [data, accounts] = await Promise.all([getToday(user?.email), getEmailAccounts()]);
  }

  const title = `${data.greeting}${data.firstName ? `, ${data.firstName}` : ""}.`;

  return <TodayBoard title={title} items={data.items} nextUp={nextUpLine(data)} stats={glance(data)} demo={data.demo} accounts={accounts} />;
}
