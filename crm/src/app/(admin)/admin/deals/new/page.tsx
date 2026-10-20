import AdminHeader from "@/components/admin/AdminHeader";
import NewDealForm from "./NewDealForm";

export default function NewDealPage() {
  return (
    <>
      <AdminHeader title="Add deal" subtitle="Put a deal on the board by hand. Deals from leads arrive here on their own." />
      <NewDealForm />
    </>
  );
}
