import AdminHeader from "@/components/admin/AdminHeader";
import CompanyInfoForm from "./CompanyInfoForm";
import EmailAccountsSection from "./EmailAccountsSection";
import AutomationSection from "./AutomationSection";
import { getAutomationSettings } from "@/lib/store/drafts";
import { getCompanyInfo } from "@/lib/store/company";
import { getEmailAccounts } from "@/lib/store/messages";
import { emailConfig, gmailEnabled, outlookEnabled, resendEnabled } from "@/lib/email/config";

interface SettingsPageProps {
  searchParams: Promise<{ gmail?: string; outlook?: string }>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const [company, accounts, automation, params] = await Promise.all([
    getCompanyInfo(),
    getEmailAccounts(),
    getAutomationSettings(),
    searchParams,
  ]);

  return (
    <>
      <AdminHeader title="Settings" subtitle="Company info, the email addresses the team sends from, and what the CRM does on its own." />
      <CompanyInfoForm company={company} />
      <EmailAccountsSection
        accounts={accounts}
        sendingDomain={emailConfig.sendingDomain}
        resendReady={resendEnabled()}
        gmailReady={gmailEnabled()}
        gmailResult={params.gmail ?? null}
        outlookReady={outlookEnabled()}
        outlookResult={params.outlook ?? null}
      />
      <AutomationSection settings={automation} />
    </>
  );
}
