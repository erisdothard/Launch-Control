import AdminHeader from "@/components/admin/AdminHeader";
import { getTodayData } from "@/lib/today/data";
import TodayClient from "./TodayClient";

function thingsLine(n: number): string {
  if (n === 0) return "All clear";
  return n === 1 ? "1 thing needs you" : `${n} things need you`;
}

export default async function TodayPage() {
  const data = await getTodayData();
  return (
    <>
      <AdminHeader title="Today" subtitle={`${data.dateLabel} · ${thingsLine(data.attention)}`} />
      <TodayClient data={data} />
    </>
  );
}
