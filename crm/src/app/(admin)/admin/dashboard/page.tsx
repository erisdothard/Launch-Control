import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getToday, TEAM_TIME_ZONE, type TodayData } from "@/lib/store/today";
import TodayQueue from "@/components/today/TodayQueue";
import Agenda from "@/components/today/Agenda";
import Pipeline from "@/components/today/Pipeline";
import { demoToday } from "@/components/today/demo";
import { DEMO_ACCOUNTS } from "@/components/inbox/demo";
import { getEmailAccounts, type EmailAccount } from "@/lib/store/messages";

// Today: everything waiting on Max, the one thing to do first, his day and the pipeline.
// `?demo=1` swaps in invented data to look at the populated screen; development only.

function nextUpLine(data: TodayData): string | null {
  const now = new Date(data.nowISO).getTime();
  const next = data.agenda.find((e) => !e.allDay && new Date(e.startsAt).getTime() > now);
  return next ? `Next up is ${next.title} at ${next.time}.` : null;
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

  return (
    <div className="grid max-w-[1204px] grid-cols-1 gap-x-11 gap-y-12 min-[1100px]:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <TodayQueue title={title} items={data.items} nextUp={nextUpLine(data)} demo={data.demo} accounts={accounts} />
      </div>
      <aside aria-label="Your day and pipeline" className="flex min-w-0 flex-col gap-[34px] min-[1100px]:pt-6">
        <Agenda events={data.agenda} nowISO={data.nowISO} timeZone={TEAM_TIME_ZONE} />
        <Pipeline figures={data.figures} />
      </aside>
    </div>
  );
}
