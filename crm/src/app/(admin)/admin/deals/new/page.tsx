import AdminHeader from "@/components/admin/AdminHeader";
import NewDealForm from "./NewDealForm";

export default function NewDealPage() {
  return (
    <>
      <AdminHeader title="Add Deal" subtitle="Manually add a deal to the pipeline." />
      <NewDealForm />
    </>
  );
}
