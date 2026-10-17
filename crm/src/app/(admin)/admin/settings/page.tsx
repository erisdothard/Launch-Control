import AdminHeader from "@/components/admin/AdminHeader";
import CompanyInfoForm from "./CompanyInfoForm";
import EmailAccountsSection from "./EmailAccountsSection";
import { getCompanyInfo } from "@/lib/store/company";
import { getEmailAccounts } from "@/lib/store/messages";
import { emailConfig, gmailEnabled, resendEnabled } from "@/lib/email/config";

interface SettingsPageProps {
  searchParams: Promise<{ gmail?: string }>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const [company, accounts, params] = await Promise.all([getCompanyInfo(), getEmailAccounts(), searchParams]);

  return (
    <>
      <AdminHeader title="Settings" subtitle="Company info, and the email addresses the team sends from." />
      <CompanyInfoForm company={company} />
      <EmailAccountsSection
        accounts={accounts}
        sendingDomain={emailConfig.sendingDomain}
        resendReady={resendEnabled()}
        gmailReady={gmailEnabled()}
        gmailResult={params.gmail ?? null}
      />
    </>
  );
}
