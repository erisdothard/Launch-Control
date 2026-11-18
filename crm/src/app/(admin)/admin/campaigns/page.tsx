import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { AutoRefresh, DeleteDraftButton } from "@/components/compose/CampaignControls";
import { DEMO_CAMPAIGNS } from "@/components/compose/demo";
import { CAMPAIGN_STATUS_LABEL } from "@/components/compose/types";
import { campaignTone, StatusPill } from "@/components/compose/ui";
import { formatTeamTime, sendDays } from "@/lib/email/merge";
import { listCampaigns, type CampaignSummary } from "@/lib/store/campaigns";

interface CampaignsPageProps {
  searchParams: Promise<{ demo?: string }>;
}

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const word = (n: number) => WORDS[n] ?? String(n);

function whenLine(c: CampaignSummary): string {
  if (c.status === "draft") return "Draft, not sent";
  if (c.status === "scheduled") return c.scheduledAt ? `Goes ${formatTeamTime(c.scheduledAt)}` : "Starting in a minute";
  if (c.status === "sending") return `Sending since ${formatTeamTime(c.startedAt ?? c.createdAt)}`;
  if (c.status === "paused") return "Paused";
  if (c.status === "cancelled") return `Cancelled ${c.finishedAt ? formatTeamTime(c.finishedAt) : ""}`.trim();
  return `Sent ${formatTeamTime(c.finishedAt ?? c.startedAt ?? c.createdAt)}`;
}

function lede(campaigns: CampaignSummary[]): string {
  if (campaigns.length === 0) return "";
  const sending = campaigns.filter((c) => c.status === "sending").length;
  const scheduled = campaigns.filter((c) => c.status === "scheduled").length;
  const parts: string[] = [];
  if (sending) parts.push(`${word(sending)} ${sending === 1 ? "is" : "are"} sending now.`);
  if (scheduled) parts.push(`${word(scheduled)} ${scheduled === 1 ? "is" : "are"} scheduled.`);
  return parts.join(" ");
}

function Progress({ c }: { c: CampaignSummary }) {
  const total = Math.max(1, c.counts.total - c.counts.skipped);
  const done = c.counts.sent + c.counts.failed;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Sent so far">
      <div className="flex h-full">
        <i className="block bg-[var(--color-steel)] transition-[width] duration-300" style={{ width: `${(c.counts.sent / total) * 100}%` }} />
        <i className="block bg-[var(--color-hot)]" style={{ width: `${(c.counts.failed / total) * 100}%` }} />
      </div>
    </div>
  );
}

export default async function CampaignsPage({ searchParams }: CampaignsPageProps) {
  const params = await searchParams;
  const demo = params.demo === "1" && process.env.NODE_ENV !== "production";
  const campaigns: CampaignSummary[] = demo ? DEMO_CAMPAIGNS : await listCampaigns();
  const q = demo ? "?demo=1" : "";
  const hero = campaigns.find((c) => c.status === "sending") ?? campaigns.find((c) => c.status === "scheduled") ?? campaigns.find((c) => c.status === "paused");
  const rest = campaigns.filter((c) => c !== hero);
  const drafts = rest.filter((c) => c.status === "draft");
  const past = rest.filter((c) => c.status === "cancelled");
  const done = rest.filter((c) => c.status !== "draft" && c.status !== "cancelled");

  return (
    <>
      {campaigns.some((c) => c.status === "sending") && <AutoRefresh />}
      <AdminHeader
        title="Campaigns"
        subtitle={lede(campaigns)}
        actions={
          <Link href={`/admin/campaigns/new${q}`} className="btn btn-primary">
            New campaign
          </Link>
        }
      />

      {campaigns.length === 0 && (
        <div className="card relative overflow-hidden px-6 py-10 sm:px-9">
          <span aria-hidden="true" className="absolute top-0 bottom-0 left-0 flex w-[5px] flex-col">
            <i className="flex-[5] bg-[var(--color-accent)]" />
            <i className="flex-[3] bg-[var(--color-livery-orange)]" />
            <i className="flex-[2] bg-[var(--color-livery-red)]" />
          </span>
          <div className="font-display text-[18px] tracking-[0.04em] text-[var(--color-steel)]">NOTHING SENT YET</div>
          <p className="mt-3 max-w-xl text-[16px] text-[var(--color-text-muted)]">
            Pick people from a saved view, a status, or a pasted list. Write the email once with their name and company filled in. It goes out
            a few a minute so Microsoft doesn&rsquo;t flag it, and can follow up on its own with anyone who doesn&rsquo;t reply.
          </p>
          <p className="mt-3 text-[15px] text-[var(--color-text-dim)]">You can also tick people on the Leads page and choose &ldquo;Email selected&rdquo;.</p>
        </div>
      )}

      {hero && (
        <Link
          href={`/admin/campaigns/${hero.id}${q}`}
          className="card group relative block overflow-hidden transition-colors hover:bg-[#13171b]"
        >
          <span aria-hidden="true" className="absolute top-0 bottom-0 left-0 flex w-[5px] flex-col">
            <i className="flex-[5] bg-[var(--color-accent)]" />
            <i className="flex-[3] bg-[var(--color-livery-orange)]" />
            <i className="flex-[2] bg-[var(--color-livery-red)]" />
          </span>
          <div className="py-6 pr-6 pl-8 sm:pl-9">
            <div className="flex flex-wrap items-center gap-3 text-[14.5px] text-[var(--color-text-muted)]">
              <StatusPill label={CAMPAIGN_STATUS_LABEL[hero.status]} tone={campaignTone(hero.status)} />
              <span>{whenLine(hero)}</span>
              {hero.fromAddress && <span className="text-[var(--color-text-dim)]">from {hero.fromAddress}</span>}
            </div>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <div className="font-display text-[19px] leading-snug tracking-[0.03em] text-[var(--color-text)] group-hover:text-white">
                  {(hero.name || hero.subject).toUpperCase()}
                </div>
                <div className="mt-1 truncate text-[15px] text-[var(--color-text-muted)]">{hero.subject}</div>
              </div>
              <div className="shrink-0 sm:text-right">
                <div className="tabular text-[30px] leading-none font-light tracking-[-0.02em] text-[var(--color-steel)]">
                  {hero.counts.sent}
                  <span className="text-[18px] text-[var(--color-text-dim)]"> / {hero.counts.total - hero.counts.skipped}</span>
                </div>
                <div className="mt-1 text-[14px] text-[var(--color-text-dim)]">sent so far</div>
              </div>
            </div>
            <div className="mt-5">
              <Progress c={hero} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[14.5px] text-[var(--color-text-muted)]">
              <span>{hero.counts.pending} waiting</span>
              {hero.counts.pending > 0 && <span>{hero.dailyLimit} a weekday, {sendDays(hero.counts.pending, hero.dailyLimit)}</span>}
              {hero.counts.failed > 0 && <span className="text-[var(--color-hot)]">{hero.counts.failed} failed</span>}
              {hero.counts.replied > 0 && <span className="text-[var(--color-success)]">{hero.counts.replied} replied</span>}
            </div>
          </div>
        </Link>
      )}

      {drafts.length > 0 && (
        <section aria-labelledby="waiting" className="mt-[34px]">
          <h2 id="waiting" className="mb-1 text-[17px] font-semibold text-[var(--color-text)]">
            Waiting for you
          </h2>
          <ul>
            {drafts.map((c) => {
              const n = c.counts.total - c.counts.skipped;
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[var(--color-border)] py-[18px]">
                  <Link href={`/admin/campaigns/${c.id}${q}`} className="group min-w-0 flex-1">
                    <div className="truncate text-[16px] font-semibold text-[var(--color-text)] group-hover:text-white">{c.name || c.subject}</div>
                    <div className="mt-0.5 text-[14.5px] text-[var(--color-text-muted)]">
                      {n} {n === 1 ? "email" : "emails"}
                      {c.fromAddress && <span className="text-[var(--color-text-dim)]"> · from {c.fromAddress}</span>}
                    </div>
                  </Link>
                  <DeleteDraftButton id={c.id} label={c.name || c.subject || "this draft"} demo={demo} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {done.length > 0 && <CampaignRows title={hero || drafts.length ? "Sent" : "All campaigns"} list={done} q={q} />}

      {past.length > 0 && (
        <details className="mt-[34px]">
          <summary className="cursor-pointer text-[15px] text-[var(--color-text-dim)] hover:text-[var(--color-text)]">Past ({past.length})</summary>
          <CampaignRows list={past} q={q} />
        </details>
      )}
    </>
  );
}

function CampaignRows({ title, list, q }: { title?: string; list: CampaignSummary[]; q: string }) {
  return (
    <section className="mt-[34px]">
      {title && <h2 className="mb-1 text-[17px] font-semibold text-[var(--color-text)]">{title}</h2>}
      <ul>
        {list.map((c) => (
          <li key={c.id} className="border-b border-[var(--color-border)]">
            <Link
              href={`/admin/campaigns/${c.id}${q}`}
              className="group grid grid-cols-[minmax(0,1fr)] gap-y-1 py-[18px] md:grid-cols-[minmax(0,1fr)_200px_160px_20px] md:items-center md:gap-x-4"
            >
              <div className="min-w-0">
                <div className="truncate text-[16px] font-semibold text-[var(--color-text)] group-hover:text-white">{c.name || c.subject}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[14.5px] text-[var(--color-text-muted)]">
                  <StatusPill label={CAMPAIGN_STATUS_LABEL[c.status]} tone={campaignTone(c.status)} />
                  <span className="truncate">{whenLine(c)}</span>
                </div>
              </div>
              <div className="text-[15px] text-[var(--color-text-muted)]">
                <span className="tabular text-[var(--color-text)]">{c.counts.sent}</span> sent
                {c.counts.failed > 0 && <span className="text-[var(--color-hot)]"> · {c.counts.failed} failed</span>}
              </div>
              <div className="text-[15px] text-[var(--color-text-muted)]">
                <span className="tabular text-[var(--color-text)]">{c.counts.replied}</span> replied
              </div>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="hidden text-[var(--color-text-dim)] transition-transform group-hover:translate-x-0.5 md:block">
                <path d="M6 3l5 5-5 5" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
