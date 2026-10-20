import AdminHeader from "@/components/admin/AdminHeader";
import NewLeadForm from "./NewLeadForm";

export default function NewLeadPage() {
  return (
    <>
      <AdminHeader title="Add Lead" subtitle="Add a lead by hand. Anyone already in the CRM is flagged before saving." />
      <NewLeadForm />
    </>
  );
}
