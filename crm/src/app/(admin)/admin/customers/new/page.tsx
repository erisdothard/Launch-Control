import AdminHeader from "@/components/admin/AdminHeader";
import NewCustomerForm from "./NewCustomerForm";

export default function NewCustomerPage() {
  return (
    <>
      <AdminHeader title="Add Customer" subtitle="Manually add a customer that didn't come through a lead conversion." />
      <NewCustomerForm />
    </>
  );
}
