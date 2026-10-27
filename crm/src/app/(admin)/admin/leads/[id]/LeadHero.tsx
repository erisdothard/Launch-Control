"use client";

import Link from "next/link";
import LocalDate from "@/components/admin/LocalDate";
import StatusBadge, { statusLabel } from "@/components/admin/StatusBadge";
import { Avatar, formatMoney } from "@/components/records/format";
import { CalendarIcon, PhoneIcon, SparkIcon } from "@/components/records/icons";
import type { Deal, Lead } from "@/lib/store/types";
import NextStep, { type StepDraft } from "./NextStepCard";

// The record's one hero object (the Today mock's hero card): who this is, where it stands, what
// it's worth, and the ONE thing to do next. Everything else on the page supports it.

export type HeroDraft = StepDraft;

export interface HeroQuote {
  body: string;
  at: string;
}

interface LeadHeroProps {
  lead: Lead;
  deal: Deal | null;
  draft: HeroDraft | null;
  lastFromThem: HeroQuote | null;
  today: string;
  onEdit: () => void;
}

const SMOOTH: ScrollBehavior = "smooth";

/** Scroll to the email thread and put the cursor in the composer, so "Reply" means reply. */
function goToMessages(e: React.MouseEvent<HTMLAnchorElement>) {
  const panel = document.getElementById("messages");
  if (!panel) return;
  e.preventDefault();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  panel.scrollIntoView({ behavior: reduce ? "auto" : SMOOTH, block: "start" });
  const box = panel.querySelector<HTMLTextAreaElement>("textarea");
  if (box) window.setTimeout(() => box.focus({ preventScroll: true }), reduce ? 0 : 450);
  history.replaceState(null, "", "#messages");
}

export default function LeadHero({ lead, deal, draft, lastFromThem, today, onEdit }: LeadHeroProps) {
  const p = lead.prospect;
  const who = [p?.contactName, p?.contactTitle].filter(Boolean).join(" · ");
  const where = [p?.segment, [p?.city, p?.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const subline = [who, where].filter(Boolean).join(" · ") || lead.email;
  const closed = lead.status === "converted" || lead.status === "lost";
  const canEmail = Boolean(lead.email) && !lead.doNotContact;
  const primary = canEmail ? (lead.awaiting === "us" ? "Reply" : "Email") : lead.phone && !lead.doNotContact ? "Call" : null;
  const telHref = lead.phone ? `tel:${lead.phone.replace(/[^\d+]/g, "")}` : null;

  return (
    <article className="card relative overflow-hidden">
      <div aria-hidden="true" className="absolute inset-y-0 left-0 flex w-[5px] flex-col">
        <i className="flex-[5] bg-[var(--color-accent)]" />
        <i className="flex-[3] bg-[var(--color-livery-orange)]" />
        <i className="flex-[2] bg-[var(--color-livery-red)]" />
      </div>
      <div className="py-5 pr-5 pl-6 sm:py-6 sm:pr-7 sm:pl-9">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] text-[var(--color-text-muted)]">
          <StatusBadge status={lead.status} variant="lead" />
          {lead.statusReason && (
            <span className="min-w-0">
              {lead.statusReason}
              {lead.statusChangedAt && (
                <span className="text-[var(--color-text-dim)]">
                  {" · "}
                  <LocalDate iso={lead.statusChangedAt} options={{ month: "short", day: "numeric" }} />
                </span>
              )}
            </span>
          )}
          {lead.doNotContact && <span className="font-medium text-[var(--color-hot)] sm:ml-auto">Asked not to be contacted. The CRM won&apos;t email them.</span>}
        </div>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={lead.businessName} size={56} />
            <div className="min-w-0">
              <h1 className="font-display text-[19px] leading-[1.3] tracking-[0.03em] break-words text-[var(--color-text)] uppercase sm:text-[22px]">
                {lead.businessName}
              </h1>
              {subline && <p className="mt-1 text-[15px] text-[var(--color-text-muted)]">{subline}</p>}
            </div>
          </div>
          <div className={`sm:ml-auto sm:block sm:text-right ${deal ? "" : "hidden"}`}>
            <p className="tabular text-[30px] leading-[1.1] font-light tracking-[-0.02em] text-[var(--color-steel)]">
              {deal ? formatMoney(deal.value) : "—"}
            </p>
            <p className="mt-0.5 text-sm text-[var(--color-text-dim)]">
              {deal ? `Deal value · ${statusLabel(deal.stage, "deal")}` : "Not quoted yet"}
            </p>
          </div>
        </div>

        {lastFromThem && lead.awaiting === "us" && (
          <blockquote className="mt-5 border-l-2 border-[var(--color-border-bright)] py-0.5 pl-4 text-[16.5px] leading-[1.55] text-[var(--color-text)]">
            <p className="line-clamp-3 whitespace-pre-line">&ldquo;{lastFromThem.body.trim()}&rdquo;</p>
            <footer className="mt-1 text-sm text-[var(--color-text-muted)]">
              {p?.contactName ? p.contactName.split(" ")[0] : "They"} wrote{" "}
              <LocalDate iso={lastFromThem.at} options={{ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }} />
            </footer>
          </blockquote>
        )}

        {!lastFromThem && !lead.lastContactedAt && p?.outreachHook && !closed && (
          <div className="well mt-5 px-4 py-3.5 sm:px-5">
            <p className="flex items-center gap-2 text-sm text-[var(--color-text-dim)]">
              <SparkIcon /> Opening angle, from lead gen
            </p>
            <p className="mt-1.5 text-[15.5px] leading-relaxed text-[var(--color-text)]">{p.outreachHook}</p>
          </div>
        )}

        {!closed && !lead.doNotContact && <NextStep key={`${lead.nextAction}|${lead.followUpOn}`} lead={lead} today={today} draft={draft} />}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {primary === "Call" && telHref ? (
            <a href={telHref} className="btn btn-primary">
              <PhoneIcon /> Call {lead.phone}
            </a>
          ) : primary ? (
            <a href="#messages" onClick={goToMessages} className="btn btn-primary">
              {primary}
            </a>
          ) : null}
          <div className="flex gap-3 *:flex-1 sm:*:flex-none">
            {telHref && primary !== "Call" && (
              <a href={telHref} className="btn btn-secondary px-3 sm:px-5" aria-label={`Call ${lead.phone}`}>
                <PhoneIcon className="hidden sm:block" /> Call
              </a>
            )}
            {!closed && (
              <Link href={`/admin/calendar?lead=${lead.id}`} className="btn btn-secondary px-3 sm:px-5">
                <CalendarIcon className="hidden sm:block" />
                <span className="sm:hidden">Meet</span>
                <span className="hidden sm:inline">Book meeting</span>
              </Link>
            )}
            <button type="button" onClick={onEdit} className="btn btn-secondary px-3 sm:px-5">
              Edit
            </button>
          </div>
          {lead.phone && primary !== "Call" && (
            <span className="tabular hidden text-[15px] text-[var(--color-text-dim)] lg:ml-auto lg:inline">{lead.phone}</span>
          )}
        </div>
      </div>
    </article>
  );
}
