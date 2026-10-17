import AdminHeader from "@/components/admin/AdminHeader";
import NewLeadForm from "./NewLeadForm";

export default function NewLeadPage() {
  return (
    <>
      <AdminHeader title="Add Lead" subtitle="Manually add a lead that didn't come through the scraper." />
      <NewLeadForm />
    </>
  );
}
