import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { getAutomationSettings, getPendingDrafts } from "@/lib/store/drafts";
import DraftsClient from "./DraftsClient";

export default async function DraftsPage() {
  const [drafts, settings] = await Promise.all([getPendingDrafts(), getAutomationSettings()]);
  const replies = drafts.filter((d) => d.kind === "reply").length;

  return (
    <>
      <AdminHeader
        title="Drafts"
        subtitle={
          drafts.length
            ? `${drafts.length} ready to send${replies ? ` · ${replies} repl${replies === 1 ? "y" : "ies"}` : ""}`
            : "Emails the CRM wrote for you. Nothing waiting right now."
        }
      />
      <p className="mb-6 max-w-2xl text-sm text-[var(--color-text-muted)]">
        When a lead writes back, a reply is drafted here.{" "}
        {settings.autoSendFollowUps
          ? "Follow-ups to leads who haven't answered go out on their own."
          : "Follow-ups to leads who haven't answered are drafted here too, because automatic sending is off."}{" "}
        <Link href="/admin/settings#automation" className="text-[var(--color-accent)] hover:underline">
          Automation settings
        </Link>
      </p>
      <DraftsClient drafts={drafts} />
    </>
  );
}
