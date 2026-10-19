import AdminHeader from "@/components/admin/AdminHeader";
import ImportLeadsClient from "./ImportLeadsClient";

export default function ImportLeadsPage() {
  return (
    <>
      <AdminHeader title="Import Leads" subtitle="Add prospects from a spreadsheet. Anyone already in the CRM is skipped." />
      <ImportLeadsClient />
    </>
  );
}
