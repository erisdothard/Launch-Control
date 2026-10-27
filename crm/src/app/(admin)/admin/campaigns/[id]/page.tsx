import Link from "next/link";
import { notFound } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import CampaignControls, { AutoRefresh } from "@/components/compose/CampaignControls";
import RecipientTable from "@/components/compose/RecipientTable";
import { DEMO_CAMPAIGNS } from "@/components/compose/demo";
import { CAMPAIGN_STATUS_LABEL } from "@/components/compose/types";
import { campaignTone, StatusPill } from "@/components/compose/ui";
import { formatTeamTime, sendDuration } from "@/lib/email/merge";
import { getCampaign, type CampaignDetail } from "@/lib/store/campaigns";

interface CampaignPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ demo?: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORDS = ["Nobody", "One person", "Two people", "Three people", "Four people", "Five people", "Six people", "Seven people", "Eight people", "Nine people", "Ten people"];
const people = (n: number) => WORDS[n] ?? `${n} people`;

function lede(c: CampaignDetail): string {
  const n = c.counts;
  const audience = n.total - n.skipped - n.cancelled;
  switch (c.status) {
    case "draft":
      return "Not sent yet. Finish it when you're ready; the list is checked again before it goes.";
    case "scheduled":
      return `Goes to ${audience} ${audience === 1 ? "person" : "people"} ${c.scheduledAt ? formatTeamTime(c.scheduledAt) : "within a minute"}. Pause or cancel any time before then.`;
    case "sending":
      return `${n.sent} of ${audience} sent so far, ${c.perMinute} a minute. ${n.pending ? `About ${sendDuration(n.pending, c.perMinute).replace(/^about /, "")} to go.` : "Finishing up."}`;
    case "paused":
      return `Paused with ${n.pending} still waiting. Nothing more goes out until you resume.`;
    case "cancelled":
      return `Cancelled. ${n.sent} ${n.sent === 1 ? "email had" : "emails had"} gone out; nobody else gets it.`;
    default: {
      const replied = n.replied ? `${people(n.replied)} replied.` : "No replies yet.";
      return `Sent to ${n.sent} ${n.sent === 1 ? "person" : "people"} ${c.finishedAt ? formatTeamTime(c.finishedAt) : ""}. ${replied}`.replace(/\s+\./, ".");
    }
  }
}

/** Highlights {{fields}} in a template so the stored message reads as what it is. */
function Template({ text }: { text: string }) {
  const parts = text.split(/(\{\{[^}]*\}\})/g);
  return (
    <p className="text-[16px] leading-relaxed whitespace-pre-wrap text-[var(--color-text)]">
      {parts.map((p, i) =>
        p.startsWith("{{") ? (
          <span key={i} className="rounded-[4px] bg-[var(--color-steel)]/[0.12] px-1 font-mono text-[14px] text-[var(--color-steel)]">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </p>
  );
}

export default async function CampaignPage({ params, searchParams }: CampaignPageProps) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const demo = sp.demo === "1" && process.env.NODE_ENV !== "production";
  const c = demo ? DEMO_CAMPAIGNS.find((x) => x.id === id) ?? null : UUID.test(id) ? await getCampaign(id) : null;
  if (!c) notFound();

  const n = c.counts;
  const audience = Math.max(1, n.total - n.skipped - n.cancelled);
  const rate = n.sent ? Math.round((n.replied / n.sent) * 100) : null;
  const q = demo ? "?demo=1" : "";

  return (
    <>
      {c.status === "sending" && <AutoRefresh />}
      <Link href={`/admin/campaigns${q}`} className="btn-quiet mb-4 inline-flex items-center gap-1.5 text-[15px]">
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M9 3L5 7l4 4" /></svg>
        All campaigns
      </Link>
      <AdminHeader title={c.name || c.subject || "Untitled"} subtitle={lede(c)} actions={<CampaignControls id={c.id} status={c.status} hasFollowUp={Boolean(c.followUpAfterDays)} demo={demo} />} />

      {/* Hero: where it stands */}
      <div className="card relative overflow-hidden">
        <span aria-hidden="true" className="absolute top-0 bottom-0 left-0 flex w-[5px] flex-col">
          <i className="flex-[5] bg-[var(--color-accent)]" />
          <i className="flex-[3] bg-[var(--color-livery-orange)]" />
          <i className="flex-[2] bg-[var(--color-livery-red)]" />
        </span>
        <div className="grid gap-6 py-6 pr-6 pl-8 sm:pl-9 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3 text-[14.5px] text-[var(--color-text-muted)]">
              <StatusPill label={CAMPAIGN_STATUS_LABEL[c.status]} tone={campaignTone(c.status)} />
              {c.fromAddress && <span>From {c.fromAddress}</span>}
              <span className="text-[var(--color-text-dim)]">{c.perMinute} a minute</span>
            </div>
            {c.status !== "draft" && (
              <>
                <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuemin={0} aria-valuemax={audience} aria-valuenow={n.sent + n.failed} aria-label="Sent so far">
                  <div className="flex h-full">
                    <i className="block bg-[var(--color-steel)]" style={{ width: `${(n.sent / audience) * 100}%` }} />
                    <i className="block bg-[var(--color-hot)]" style={{ width: `${(n.failed / audience) * 100}%` }} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-[var(--color-text-muted)]">
                  <span>
                    <b className="tabular font-semibold text-[var(--color-text)]">{n.sent}</b> sent
                  </span>
                  {n.pending > 0 && (
                    <span>
                      <b className="tabular font-semibold text-[var(--color-text)]">{n.pending}</b> waiting
                    </span>
                  )}
                  {n.failed > 0 && (
                    <span className="text-[var(--color-hot)]">
                      <b className="tabular font-semibold">{n.failed}</b> failed
                    </span>
                  )}
                  {n.skipped > 0 && (
                    <span>
                      <b className="tabular font-semibold text-[var(--color-text)]">{n.skipped}</b> left out
                    </span>
                  )}
                  {n.followUpsSent > 0 && (
                    <span>
                      <b className="tabular font-semibold text-[var(--color-text)]">{n.followUpsSent}</b> followed up
                    </span>
                  )}
                </div>
              </>
            )}
            {c.followUpAfterDays && (
              <p className="mt-3 text-[15px] text-[var(--color-text-dim)]">Follows up after {c.followUpAfterDays} days with anyone who hasn&rsquo;t replied.</p>
            )}
          </div>
          {c.status !== "draft" && (
            <div className="md:border-l md:border-[var(--color-border)] md:pl-6 md:text-right">
              <div className="tabular text-[30px] leading-[1.1] font-light tracking-[-0.03em] text-[var(--color-steel)]">{rate === null ? "—" : `${rate}%`}</div>
              <div className="text-[14px] text-[var(--color-text-dim)]">replied</div>
              <div className="mt-1 text-[14px] text-[var(--color-text-muted)]">
                {n.replied} of {n.sent}
              </div>
            </div>
          )}
        </div>
      </div>

      <RecipientTable recipients={c.recipients} />

      {/* The message as written, with its fields */}
      <section aria-labelledby="message" className="mt-[34px] grid gap-6 lg:grid-cols-2">
        <div className="card p-5 sm:p-6">
          <h2 id="message" className="text-[17px] font-semibold text-[var(--color-text)]">
            The email
          </h2>
          <div className="mt-3 text-[14px] text-[var(--color-text-dim)]">Subject</div>
          <div className="text-[16px] font-semibold text-[var(--color-text)]">
            <Template text={c.subject} />
          </div>
          <div className="mt-4 text-[14px] text-[var(--color-text-dim)]">Message</div>
          <div className="well mt-1 px-4 py-3">
            <Template text={c.bodyText} />
          </div>
          {c.attachments.length > 0 && (
            <p className="mt-3 text-[15px] text-[var(--color-text-muted)]">Attached: {c.attachments.map((a) => a.name).join(", ")}</p>
          )}
        </div>
        {c.followUpBody && (
          <div className="card p-5 sm:p-6">
            <h2 className="text-[17px] font-semibold text-[var(--color-text)]">The follow-up</h2>
            <div className="mt-3 text-[14px] text-[var(--color-text-dim)]">Subject</div>
            <div className="text-[16px] text-[var(--color-text)]">{c.followUpSubject || `Re: ${c.subject}`}</div>
            <div className="mt-4 text-[14px] text-[var(--color-text-dim)]">Message, after {c.followUpAfterDays ?? "—"} days</div>
            <div className="well mt-1 px-4 py-3">
              <Template text={c.followUpBody} />
            </div>
          </div>
        )}
      </section>
    </>
  );
}
