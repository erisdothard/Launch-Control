"use client";

import LocalDate from "@/components/admin/LocalDate";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { type Lead, type ActivityEntry, type CalendarEvent, type Deal } from "@/lib/store/types";
import { FactorBars, SignalChips } from "@/components/admin/ProspectInsights";
import { scoreBand } from "@/lib/leadgen/factors";
import { BackIcon, SparkIcon } from "@/components/records/icons";
import {
  markLeadNotAFitAction,
  deleteLeadAction,
  convertLeadAction,
  convertLeadToDealAction,
} from "../actions";
import NextStepCard from "./NextStepCard";
import LeadHero, { type HeroDraft, type HeroQuote } from "./LeadHero";
import LeadFacts from "./LeadFacts";

// The lead record. Layout (Close/Attio pattern): hero across the top, facts on the left, the
// email thread and history on the right. On a phone it's one column in the order Max needs:
// hero (with the primary action), next step, messages, then the facts.
// The two column wrappers are `display: contents` below lg so their children can be reordered.

const ACTION_LABEL: Record<ActivityEntry["action"], string> = {
  created: "Added",
  updated: "Details updated",
  status_changed: "Status changed",
  converted: "Converted",
  deleted: "Deleted",
};

interface LeadDetailClientProps {
  lead: Lead;
  deal: Deal | null;
  draft: HeroDraft | null;
  lastFromThem: HeroQuote | null;
  activity: ActivityEntry[];
  meetings: CalendarEvent[];
  today: string; // the team's calendar day, from the server
  messages: React.ReactNode; // MessagesPanel, owned by the Inbox builder
}

function Meetings({ lead, meetings }: { lead: Lead; meetings: CalendarEvent[] }) {
  return (
    <section aria-labelledby="meetings-heading" className="card p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="meetings-heading" className="text-[17px] font-semibold text-[var(--color-text)]">
          Meetings
        </h2>
        <Link href={`/admin/calendar?lead=${lead.id}`} className="btn-quiet">
          Book one
        </Link>
      </div>
      {meetings.length === 0 ? (
        <p className="mt-2 text-[15px] text-[var(--color-text-dim)]">Nothing on the calendar with them.</p>
      ) : (
        <ul className="mt-3">
          {meetings.map((m) => {
            const day = new Date(m.startsAt);
            const dayParam = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
            return (
              <li key={m.id} className="border-t border-[var(--color-border)] first:border-0">
                <Link
                  href={`/admin/calendar?m=${dayParam.slice(0, 7)}&day=${dayParam}`}
                  className="-mx-2 grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-[var(--radius-sm)] px-2 py-3 transition-colors hover:bg-[var(--color-bg-hover)]"
                >
                  <span className="font-mono text-sm text-[var(--color-text-muted)]">
                    <LocalDate iso={m.startsAt} options={{ month: "short", day: "numeric" }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] text-[var(--color-text)]">{m.title}</span>
                    {!m.allDay && (
                      <span className="block text-sm text-[var(--color-text-dim)]">
                        <LocalDate iso={m.startsAt} options={{ weekday: "long", hour: "numeric", minute: "2-digit" }} />
                        {m.location && ` · ${m.location}`}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function LeadGenFit({ lead }: { lead: Lead }) {
  const p = lead.prospect;
  if (!p) return null;
  const band = p.score !== null ? scoreBand(p.score) : null;
  return (
    <section aria-labelledby="fit-heading" className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="fit-heading" className="flex items-center gap-2 text-[17px] font-semibold text-[var(--color-text)]">
            <SparkIcon className="text-[var(--color-text-dim)]" /> Lead-gen fit
          </h2>
          <p className="mt-0.5 text-sm text-[var(--color-text-dim)]">Scored by the lead-gen run, not by a person.</p>
        </div>
        {p.score !== null && (
          <span className={`tabular shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${band?.className ?? ""}`}>
            {p.score} · {band?.label}
          </span>
        )}
      </div>
      {p.scoreReason && <p className="mt-4 text-[15px] leading-relaxed text-[var(--color-text)]">{p.scoreReason}</p>}
      <details className="group mt-4">
        <summary className="btn-quiet inline-flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Show the eleven factors</span>
          <span className="hidden group-open:inline">Hide the factors</span>
        </summary>
        <div className="mt-4 space-y-5">
          <SignalChips lead={lead} />
          <FactorBars lead={lead} />
        </div>
      </details>
    </section>
  );
}

// Details are written by the store ("→ customer <uuid> (deal won)"); keep the words, drop the ids.
function readableDetail(detail: string): string {
  return detail
    .replace(/\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")
    .replace(/→\s*/g, "to ")
    .replace(/\s+/g, " ")
    .trim();
}

function Activity({ activity }: { activity: ActivityEntry[] }) {
  return (
    <section aria-labelledby="activity-heading" className="card p-5 sm:p-6">
      <h2 id="activity-heading" className="text-[17px] font-semibold text-[var(--color-text)]">
        History
      </h2>
      {activity.length === 0 ? (
        <p className="mt-2 text-[15px] text-[var(--color-text-dim)]">Nothing recorded yet.</p>
      ) : (
        <ol className="mt-4">
          {activity.map((entry, i) => (
            <li key={entry.id} className="relative grid grid-cols-[14px_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
              {i < activity.length - 1 && <span aria-hidden="true" className="absolute top-[14px] bottom-0 left-[4px] w-px bg-[var(--color-border-bright)]" />}
              <span aria-hidden="true" className="mt-[7px] h-[9px] w-[9px] rounded-full border border-[var(--color-steel)] bg-[var(--color-bg-card)]" />
              <div className="min-w-0">
                <p className="text-[15px] text-[var(--color-text)]">
                  {ACTION_LABEL[entry.action]}
                  {entry.detail && <span className="text-[var(--color-text-muted)]"> {readableDetail(entry.detail)}</span>}
                </p>
                <p className="text-sm text-[var(--color-text-dim)]">
                  <LocalDate iso={entry.createdAt} options={{ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }} />
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function LeadDetailClient({ lead, deal, draft, lastFromThem, activity, meetings, today, messages }: LeadDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "not-a-fit" | null>(null);
  const [dealValue, setDealValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closed = lead.status === "converted" || lead.status === "lost";

  function run(task: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await task();
      } catch {
        setError("That didn't go through. Nothing was changed; try again.");
      }
    });
  }

  const handleNotAFit = () =>
    run(async () => {
      await markLeadNotAFitAction(lead.id);
      setConfirm(null);
      router.refresh();
    });
  const handleDelete = () =>
    run(async () => {
      await deleteLeadAction(lead.id);
      router.push("/admin/leads");
    });
  const handleConvert = () =>
    run(async () => {
      const customer = await convertLeadAction(lead.id);
      if (customer) router.push("/admin/customers");
    });
  const handleCreateDeal = () =>
    run(async () => {
      const result = await convertLeadToDealAction(lead.id, Number(dealValue) || 0);
      if (result.ok) router.push("/admin/deals");
    });

  return (
    <div className="mx-auto max-w-[1240px]">
      <Link href="/admin/leads" className="btn-quiet mb-5 inline-flex items-center gap-2">
        <BackIcon /> Leads
      </Link>

      <LeadHero lead={lead} deal={deal} draft={draft} lastFromThem={lastFromThem} today={today} onEdit={() => setEditing(true)} />

      <div className="mt-4 flex flex-col gap-4 lg:mt-6 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <div className="order-1 lg:order-none">
            <NextStepCard key={`${lead.nextAction}|${lead.followUpOn}`} lead={lead} today={today} />
          </div>
          <div className="order-3 lg:order-none">
            <LeadFacts key={editing ? "edit" : "view"} lead={lead} editing={editing} onDone={() => setEditing(false)} />
          </div>
          <section aria-label="More actions" className="order-7 card p-5 sm:p-6 lg:order-none">
            <h2 className="text-[17px] font-semibold text-[var(--color-text)]">Move it along</h2>
            <div className="mt-4 flex flex-col gap-3">
              {dealValue === null ? (
                <button type="button" onClick={() => setDealValue(deal ? String(deal.value) : "")} disabled={isPending || closed} className="btn btn-secondary w-full">
                  {deal ? "Open another deal" : "Create deal"}
                </button>
              ) : (
                <div className="well p-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-[var(--color-text-dim)]">Deal value in dollars (optional)</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="100"
                      value={dealValue}
                      onChange={(e) => setDealValue(e.target.value)}
                      placeholder="0"
                      className="field tabular"
                      disabled={isPending}
                    />
                  </label>
                  <div className="mt-3 flex items-center gap-3">
                    <button type="button" onClick={handleCreateDeal} disabled={isPending} className="btn btn-secondary btn-sm">
                      {isPending ? "Creating" : "Create deal"}
                    </button>
                    <button type="button" onClick={() => setDealValue(null)} className="btn-quiet">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <button type="button" onClick={handleConvert} disabled={isPending || lead.status === "converted"} className="btn btn-secondary w-full">
                {lead.status === "converted" ? "Already a customer" : "Make them a customer"}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--color-border)] pt-4">
              {confirm === null && (
                <>
                  {!closed && (
                    <button type="button" onClick={() => setConfirm("not-a-fit")} className="btn-quiet">
                      Not a fit
                    </button>
                  )}
                  <button type="button" onClick={() => setConfirm("delete")} className="btn-quiet hover:!text-[var(--color-hot)]">
                    Delete lead
                  </button>
                </>
              )}
              {confirm === "not-a-fit" && (
                <div className="w-full">
                  <p className="text-[15px] text-[var(--color-text)]">Close this lead as not a fit? Follow-ups stop.</p>
                  <div className="mt-3 flex items-center gap-3">
                    <button type="button" onClick={handleNotAFit} disabled={isPending} className="btn btn-secondary btn-sm">
                      Close it
                    </button>
                    <button type="button" onClick={() => setConfirm(null)} className="btn-quiet">
                      Keep it open
                    </button>
                  </div>
                </div>
              )}
              {confirm === "delete" && (
                <div className="w-full">
                  <p className="text-[15px] text-[var(--color-hot)]">Delete this lead and its history? This can&apos;t be undone.</p>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isPending}
                      className="btn btn-sm bg-[var(--color-danger)] text-white hover:bg-[#c81f17]"
                    >
                      Delete
                    </button>
                    <button type="button" onClick={() => setConfirm(null)} className="btn-quiet">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            {error && (
              <p role="alert" className="mt-3 text-[15px] text-[var(--color-hot)]">
                {error}
              </p>
            )}
          </section>
        </div>

        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <div className="order-2 min-w-0 scroll-mt-6 lg:order-none">{messages}</div>
          <div className="order-4 lg:order-none">
            <Meetings lead={lead} meetings={meetings} />
          </div>
          <div className="order-5 empty:hidden lg:order-none">
            <LeadGenFit lead={lead} />
          </div>
          <div className="order-6 lg:order-none">
            <Activity activity={activity} />
          </div>
        </div>
      </div>
    </div>
  );
}
