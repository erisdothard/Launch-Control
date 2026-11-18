import AdminHeader from "@/components/admin/AdminHeader";
import CompanyInfoForm from "./CompanyInfoForm";
import EmailAccountsSection from "./EmailAccountsSection";
import AutomationSection from "./AutomationSection";
import AppearanceSection from "./AppearanceSection";
import { getTheme } from "@/lib/store/theme";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BACKGROUND_PRESETS } from "@/lib/theme/theme";
import SettingsTabs, { type SettingsTab } from "./SettingsTabs";
import { getAutomationSettings, getAutopilotPulse } from "@/lib/store/drafts";
import { getCompanyInfo, getSignaturePhones } from "@/lib/store/company";
import { getEmailAccounts } from "@/lib/store/messages";
import { emailConfig, gmailEnabled, outlookAppOnly, outlookEnabled, resendEnabled } from "@/lib/email/config";

interface SettingsPageProps {
  searchParams: Promise<{ gmail?: string; outlook?: string; tab?: string }>;
}

const TABS: SettingsTab[] = ["signatures", "autopilot", "company", "appearance"];

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const supabase = await createServerSupabaseClient();
  const [company, accounts, phones, automation, params, user] = await Promise.all([
    getCompanyInfo(),
    getEmailAccounts(),
    getSignaturePhones(),
    getAutomationSettings(),
    searchParams,
    supabase.auth.getUser().then((r) => r.data.user),
  ]);
  const theme = await getTheme(user?.email);

  const pulse = await getAutopilotPulse(automation.followUpDays.length);
  const live = accounts.filter((a) => a.status !== "disabled");
  const broken = live.some((a) => a.status !== "active");
  const signers = live.filter((a) => a.signatureName.trim()).length;
  const initial = TABS.includes(params.tab as SettingsTab) ? (params.tab as SettingsTab) : "signatures";

  const autopilotStatus = [automation.draftReplies && "Writing replies", automation.autoSendFollowUps && "sending follow-ups"].filter(Boolean).join(", ");

  return (
    <>
      <AdminHeader title="Settings" />
      <div className="max-w-[1100px]">
        <SettingsTabs
          initial={initial}
          tabs={[
            {
              id: "signatures",
              label: "Signatures",
              status: broken ? "An address stopped sending" : signers === 1 ? "1 person signing" : `${signers} people signing`,
              alert: broken,
            },
            {
              id: "autopilot",
              label: "Autopilot",
              status: autopilotStatus ? autopilotStatus.charAt(0).toUpperCase() + autopilotStatus.slice(1) : "Everything waits for you",
            },
            { id: "company", label: "Company", status: company.name || "Name and logo" },
            { id: "appearance", label: "Colours", status: BACKGROUND_PRESETS.find((p) => p.value === theme?.background)?.name ?? (theme ? "Your own" : "Graphite") },
          ]}
          panels={{
            signatures: (
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
            ),
            autopilot: <AutomationSection settings={automation} pulse={pulse} />,
            company: <CompanyInfoForm company={company} />,
            appearance: <AppearanceSection saved={theme} />,
          }}
        />
      </div>
    </>
  );
}
