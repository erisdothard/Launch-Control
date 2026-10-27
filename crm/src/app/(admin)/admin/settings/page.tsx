import AdminHeader from "@/components/admin/AdminHeader";
import CompanyInfoForm from "./CompanyInfoForm";
import EmailAccountsSection from "./EmailAccountsSection";
import AutomationSection from "./AutomationSection";
import { getAutomationSettings } from "@/lib/store/drafts";
import { getCompanyInfo, getSignaturePhones } from "@/lib/store/company";
import { getEmailAccounts } from "@/lib/store/messages";
import { emailConfig, gmailEnabled, outlookAppOnly, outlookEnabled, resendEnabled } from "@/lib/email/config";

interface SettingsPageProps {
  searchParams: Promise<{ gmail?: string; outlook?: string }>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const [company, accounts, phones, automation, params] = await Promise.all([
    getCompanyInfo(),
    getEmailAccounts(),
    getSignaturePhones(),
    getAutomationSettings(),
    searchParams,
  ]);

  return (
    <>
      <AdminHeader
        title="Settings"
        subtitle="Who your email comes from and how it is signed, what the CRM does for you on its own, and your company details."
      />
      <div className="max-w-[1100px] space-y-8">
        <EmailAccountsSection
          accounts={accounts}
          phones={phones}
          sendingDomain={emailConfig.sendingDomain}
          resendReady={resendEnabled()}
          gmailReady={gmailEnabled()}
          gmailResult={params.gmail ?? null}
          outlookReady={outlookEnabled()}
          outlookResult={params.outlook ?? null}
          appOnly={outlookAppOnly()}
          appMailbox={emailConfig.msAppMailbox}
        />
        <AutomationSection settings={automation} />
        <CompanyInfoForm company={company} />
      </div>
    </>
  );
}
