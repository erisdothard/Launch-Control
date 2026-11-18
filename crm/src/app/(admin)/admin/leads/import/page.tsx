import AdminHeader from "@/components/admin/AdminHeader";
import ImportLeadsClient from "./ImportLeadsClient";

export default function ImportLeadsPage() {
  return (
    <>
      <AdminHeader title="Import Leads" />
      <ImportLeadsClient />
    </>
  );
}
