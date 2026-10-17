import AdminHeader from "@/components/admin/AdminHeader";
import { getTasks } from "@/lib/store/tasks";
import { getLeads } from "@/lib/store/leads";
import { getDeals } from "@/lib/store/deals";
import TasksListClient from "./TasksListClient";

export default async function TasksPage() {
  const [tasks, leads, deals] = await Promise.all([getTasks(), getLeads(), getDeals()]);

  const relatedOptions = [
    ...leads.map((l) => ({ type: "lead" as const, id: l.id, label: l.businessName })),
    ...deals.map((d) => ({ type: "deal" as const, id: d.id, label: d.businessName })),
  ];

  return (
    <>
      <AdminHeader title="Tasks" subtitle="Follow-ups and to-dos across leads and deals." />
      <TasksListClient tasks={tasks} relatedOptions={relatedOptions} />
    </>
  );
}
