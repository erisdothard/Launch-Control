import AdminHeader from "@/components/admin/AdminHeader";
import NewCustomerForm from "./NewCustomerForm";

export default function NewCustomerPage() {
  return (
    <>
      <AdminHeader title="Add Customer" />
      <NewCustomerForm />
    </>
  );
}
