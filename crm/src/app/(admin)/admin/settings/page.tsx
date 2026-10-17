import AdminHeader from "@/components/admin/AdminHeader";
import CompanyInfoForm from "./CompanyInfoForm";
import { getCompanyInfo } from "@/lib/store/company";

export default async function SettingsPage() {
  const company = await getCompanyInfo();

  return (
    <>
      <AdminHeader title="Settings" subtitle="Company info shown across the CRM — logo, name, and contact details." />
      <CompanyInfoForm company={company} />
    </>
  );
}
