import AdminHeader from "@/components/admin/AdminHeader";
import NewCustomerForm from "./NewCustomerForm";

export default function NewCustomerPage() {
  return (
    <>
      <AdminHeader title="Add customer" subtitle="For a client who did not come through a lead. Won deals become customers on their own." />
      <NewCustomerForm />
    </>
  );
}
