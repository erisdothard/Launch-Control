import AdminHeader from "@/components/admin/AdminHeader";
import { getEvents } from "@/lib/store/calendar";
import { getLeads } from "@/lib/store/leads";
import { getTasks } from "@/lib/store/tasks";
import { outlookOnlyEvents } from "@/lib/email/outlookCalendar";
import { teamTodayISO } from "@/lib/leads/followUp";
import { matchesView } from "@/lib/store/types";
import CalendarClient, { type CalendarLead, type DatedItem } from "./CalendarClient";
import { parseShow } from "./kinds";

const MONTH = /^(\d{4})-(\d{2})$/;
// The grid shows up to 6 days either side of the month; pad the UTC query so no timezone loses an event.
const PAD_DAYS = 8;

interface CalendarPageProps {
  searchParams: Promise<{ m?: string; lead?: string; day?: string; show?: string }>;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = await searchParams;
  const now = new Date();
  const match = params.m?.match(MONTH);
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Math.min(12, Math.max(1, Number(match[2]))) : now.getMonth() + 1;

  const from = new Date(Date.UTC(year, month - 1, 1 - PAD_DAYS)).toISOString();
  const to = new Date(Date.UTC(year, month, 1 + PAD_DAYS)).toISOString();
  const [crmEvents, leads, tasks] = await Promise.all([getEvents(from, to), getLeads(), getTasks()]);
  const outlook = await outlookOnlyEvents(from, to, new Set(crmEvents.flatMap((e) => (e.outlookEventId ? [e.outlookEventId] : []))));
  const events = [...crmEvents, ...outlook.events];

  const leadOptions: CalendarLead[] = leads
    .map((l) => ({ id: l.id, name: l.businessName }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const today = teamTodayISO();
  const dayLabel = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  // Follow-ups are the same leads Today and Leads count as "Follow-ups due" (on today, overdue ones
  // included, so today's count matches), plus the ones scheduled for later days.
  const dated: DatedItem[] = [
    ...leads
      .filter((l) => matchesView(l, "follow-up", today) || (matchesView(l, "waiting", today) && l.followUpOn))
      .map<DatedItem>((l) => {
        const overdue = l.followUpOn! < today;
        return {
          key: `f-${l.id}`,
          kind: "followup",
          date: overdue ? today : l.followUpOn!,
          title: l.businessName,
          detail: `${l.nextAction || "Follow up"}${overdue ? ` · overdue since ${dayLabel(l.followUpOn!)}` : ""}`,
          href: `/admin/leads/${l.id}`,
        };
      }),
    ...tasks
      .filter((t) => t.dueDate && !t.done)
      .map<DatedItem>((t) => ({
        key: `t-${t.id}`,
        kind: "task",
        date: t.dueDate!,
        title: t.title,
        detail: t.relatedLabel ?? "Task",
        href: t.relatedType === "lead" && t.relatedId ? `/admin/leads/${t.relatedId}` : "/admin/tasks",
      })),
  ];

  return (
    <>
      <AdminHeader title="Calendar" subtitle="Your appointments, with follow-ups and tasks when you want them. Use the switches to show or hide each kind." />
      <CalendarClient
        year={year}
        month={month}
        events={events}
        dated={dated}
        leads={leadOptions}
        presetLeadId={params.lead ?? null}
        presetDay={params.day ?? null}
        outlookError={outlook.error}
        today={today}
        initialShow={parseShow(params.show)}
      />
    </>
  );
}
