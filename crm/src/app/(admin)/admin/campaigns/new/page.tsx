import AdminHeader from "@/components/admin/AdminHeader";
import Composer from "@/components/compose/Composer";
import { leadCandidate, type AudienceLead, type Candidate } from "@/components/compose/audience";
import { DEMO_ACCOUNTS, DEMO_CAMPAIGNS, DEMO_LEADS, DEMO_SUPPRESSED, DEMO_TEMPLATES } from "@/components/compose/demo";
import { DEFAULT_PER_MINUTE, type ComposerPrefill } from "@/components/compose/types";
import { getAudienceLeads, getCampaign, getSendingAccounts, getSuppressedEmails, type CampaignDetail } from "@/lib/store/campaigns";
import { listTemplates } from "@/lib/store/templates";
import { teamTodayISO } from "@/lib/leads/followUp";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface NewCampaignPageProps {
  searchParams: Promise<{ leads?: string; from?: string; demo?: string; step?: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fromLeadIds(ids: string[], leads: AudienceLead[]): Candidate[] {
  const byId = new Map(leads.map((l) => [l.id, l]));
  return ids.flatMap((id) => {
    const lead = byId.get(id);
    return lead ? [leadCandidate(lead, "Picked on the Leads page")] : [];
  });
}

/** A saved campaign as a starting point: continue a draft, or copy any campaign as a new one. */
function fromCampaign(c: CampaignDetail): ComposerPrefill {
  const isDraft = c.status === "draft";
  return {
    draftId: isDraft ? c.id : null,
    name: isDraft ? c.name : `Copy of ${c.name || c.subject}`,
    accountId: c.accountId,
    includeSignature: c.includeSignature,
    subject: c.subject,
    body: c.bodyText,
    attachments: c.attachments,
    candidates: c.recipients.map((r) => ({ email: r.email, leadId: r.leadId, values: r.merge, origin: isDraft ? "Saved draft" : "From the copied email" })),
    edits: Object.fromEntries(
      c.recipients
        .filter((r) => r.subjectOverride || r.bodyOverride)
        .map((r) => [r.email, { subject: r.subjectOverride ?? c.subject, body: r.bodyOverride ?? c.bodyText }])
    ),
    skipContactedDays: c.skipContactedDays,
    perMinute: c.perMinute || DEFAULT_PER_MINUTE,
    followUp: c.followUpAfterDays && c.followUpBody ? { days: c.followUpAfterDays, subject: c.followUpSubject ?? "", body: c.followUpBody } : null,
    note: isDraft
      ? "Your saved draft. The list is checked again against who has opted out since."
      : `Copied from “${c.name || c.subject}”. Check the list: anyone emailed since may be left out.`,
  };
}

function blankPrefill(candidates: Candidate[], note: string): ComposerPrefill {
  return {
    draftId: null,
    name: "",
    accountId: null,
    includeSignature: true,
    subject: "",
    body: "",
    attachments: [],
    candidates,
    edits: {},
    skipContactedDays: 0,
    perMinute: DEFAULT_PER_MINUTE,
    followUp: null,
    note,
  };
}

export default async function NewCampaignPage({ searchParams }: NewCampaignPageProps) {
  const params = await searchParams;
  // ?demo=1 renders every step with invented people and never touches the database. Dev only.
  const demo = params.demo === "1" && process.env.NODE_ENV !== "production";
  const step = params.step === "2" ? 2 : params.step === "3" ? 3 : 1;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [leads, suppressed, accounts, templates] = demo
    ? [DEMO_LEADS, DEMO_SUPPRESSED, DEMO_ACCOUNTS, DEMO_TEMPLATES]
    : await Promise.all([getAudienceLeads(teamTodayISO()), getSuppressedEmails(), getSendingAccounts(), listTemplates()]);

  let prefill: ComposerPrefill | null = null;
  const leadParam = params.leads ?? "";
  const ids = leadParam && leadParam !== "handoff" ? leadParam.split(",").filter((id) => UUID.test(id)).slice(0, 2000) : [];
  if (ids.length) {
    const picked = fromLeadIds(ids, leads);
    prefill = blankPrefill(picked, `${picked.length} ${picked.length === 1 ? "person" : "people"} picked on the Leads page. Add more below if you like.`);
  } else if (params.from && (UUID.test(params.from) || demo)) {
    const source = demo ? DEMO_CAMPAIGNS.find((c) => c.id === params.from) ?? null : await getCampaign(params.from);
    if (source) prefill = fromCampaign(source);
  } else if (demo && step > 1) {
    // Screenshots of later steps need someone on the list and a message.
    prefill = {
      ...blankPrefill(DEMO_LEADS.map((l) => leadCandidate(l, "Not contacted view")), ""),
      subject: DEMO_TEMPLATES[0].subject,
      body: DEMO_TEMPLATES[0].bodyText,
      skipContactedDays: 7,
    };
  }

  const continuing = prefill?.draftId != null;

  return (
    <>
      <AdminHeader
        title={continuing ? "Finish your draft" : "New campaign"}
        subtitle="Three steps: pick who gets it, write it once, then choose when it goes. Everyone gets their own email, filled in with their name."
      />
      <Composer
        leads={leads}
        suppressed={suppressed}
        accounts={accounts}
        templates={templates}
        userEmail={user?.email ?? ""}
        prefill={prefill}
        handoff={leadParam === "handoff"}
        demo={demo}
        initialStep={step}
      />
    </>
  );
}
