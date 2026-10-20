import Link from "next/link";
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
      <AdminHeader title="Settings" subtitle="Company info, the addresses the team sends from, and what the CRM does on its own." />
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

      <section id="history" aria-labelledby="history-heading" className="card mt-6 max-w-3xl p-5 sm:p-6">
        <h2 id="history-heading" className="label-mono text-[var(--color-steel)]">
          History
        </h2>
        <p className="mt-2 text-base text-[var(--color-text-muted)]">
          Every lead, deal and customer change is recorded as it happens.
        </p>
        <Link href="/admin/activity" className="link mt-3 inline-flex min-h-[44px] items-center">
          Everything the CRM recorded →
        </Link>
        <p className="mt-4 border-t border-[var(--color-border)] pt-4 text-base text-[var(--color-text-muted)]">
          Your password is changed from{" "}
          <Link href="/admin/update-password" className="link">
            Change password
          </Link>
          , at the bottom of the sidebar.
        </p>
      </section>
    </>
  );
}
