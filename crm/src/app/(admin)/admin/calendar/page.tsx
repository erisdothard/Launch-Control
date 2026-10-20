import AdminHeader from "@/components/admin/AdminHeader";
import { getEvents } from "@/lib/store/calendar";
import { getLeads } from "@/lib/store/leads";
import { getTasks } from "@/lib/store/tasks";
import CalendarClient, { type CalendarLead, type DatedItem } from "./CalendarClient";

const MONTH = /^(\d{4})-(\d{2})$/;
// The grid shows up to 6 days either side of the month; pad the UTC query so no timezone loses an event.
const PAD_DAYS = 8;

interface CalendarPageProps {
  searchParams: Promise<{ m?: string; lead?: string; day?: string }>;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = await searchParams;
  const now = new Date();
  const match = params.m?.match(MONTH);
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Math.min(12, Math.max(1, Number(match[2]))) : now.getMonth() + 1;

  const from = new Date(Date.UTC(year, month - 1, 1 - PAD_DAYS)).toISOString();
  const to = new Date(Date.UTC(year, month, 1 + PAD_DAYS)).toISOString();
  const [events, leads, tasks] = await Promise.all([getEvents(from, to), getLeads(), getTasks()]);

  const leadOptions: CalendarLead[] = leads
    .map((l) => ({ id: l.id, name: l.businessName }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const dated: DatedItem[] = [
    ...leads
      .filter((l) => l.followUpOn && l.status !== "converted" && l.status !== "lost")
      .map<DatedItem>((l) => ({
        key: `f-${l.id}`,
        kind: "followup",
        date: l.followUpOn!,
        title: l.businessName,
        detail: l.nextAction || "Follow up",
        href: `/admin/leads/${l.id}`,
      })),
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
      <AdminHeader title="Calendar" subtitle="Meetings, follow-ups and tasks for the whole team." />
      <CalendarClient
        year={year}
        month={month}
        events={events}
        dated={dated}
        leads={leadOptions}
        presetLeadId={params.lead ?? null}
        presetDay={params.day ?? null}
      />
    </>
  );
}
