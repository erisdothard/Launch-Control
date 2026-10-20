"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDaysISO, type TodayData } from "@/lib/today/types";
import Section from "./Section";
import MeetingsList from "./MeetingsList";
import ReplyCard from "./ReplyCard";
import FollowUpCard from "./FollowUpCard";
import InquiryCard from "./InquiryCard";
import WaitingDrafts from "./WaitingDrafts";

const REFRESH_MS = 30_000;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export default function TodayClient({ data }: { data: TodayData }) {
  const router = useRouter();
  // Cards that were acted on leave the page at once; the next refresh confirms it from the server.
  const [gone, setGone] = useState<Set<string>>(new Set());
  const busy = useRef<Set<string>>(new Set());

  const hide = (key: string) => {
    setGone((g) => new Set(g).add(key));
    router.refresh();
  };
  const setBusy = (key: string, on: boolean) => {
    if (on) busy.current.add(key);
    else busy.current.delete(key);
  };

  // Replies land while the page is open; look again every half minute unless something is mid-send.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden || busy.current.size > 0) return;
      router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [router]);

  const replies = data.replies.filter((r) => !gone.has(`lead-${r.leadId}`));
  const followUps = data.followUps.filter((f) => !gone.has(`lead-${f.leadId}`));
  const inquiries = data.inquiries.filter((i) => !gone.has(`lead-${i.leadId}`));
  const drafts = data.waitingDrafts.filter((d) => !gone.has(`draft-${d.id}`));
  const snoozeTo = addDaysISO(data.today, 7);
  const { pipeline } = data;
  const allClear = data.meetings.length + replies.length + followUps.length + inquiries.length + drafts.length === 0;

  return (
    <div className="max-w-4xl">
      <Section
        id="meetings"
        title="Meetings today"
        count={data.meetings.length}
        empty={data.outlookError ? "No meetings in the CRM today. Outlook didn't answer, so check it directly." : "No meetings today."}
        aside={
          <Link href="/admin/calendar" className="link t-small">
            Open calendar
          </Link>
        }
      >
        <MeetingsList meetings={data.meetings} />
        {data.outlookError && <p className="mt-2 t-small text-[var(--color-warn)]">{"Outlook didn't answer just now; showing CRM meetings only."}</p>}
      </Section>

      <Section
        id="replies"
        title="Replies to answer"
        count={replies.length + data.moreReplies}
        empty="Nobody is waiting on a reply."
        aside={
          data.moreReplies > 0 ? (
            <Link href="/admin/leads?view=needs-reply" className="link t-small">
              {plural(data.moreReplies, "more on the leads page", "more on the leads page")}
            </Link>
          ) : undefined
        }
      >
        <ul className="space-y-3">
          {replies.map((r) => (
            <ReplyCard key={r.leadId} item={r} onSent={(id) => hide(`lead-${id}`)} onBusy={(id, on) => setBusy(`lead-${id}`, on)} />
          ))}
        </ul>
      </Section>

      <Section id="follow-ups" title="Follow-ups due" count={followUps.length} empty="No follow-ups due.">
        <ul className="space-y-3">
          {followUps.map((f) => (
            <FollowUpCard key={f.leadId} item={f} snoozeTo={snoozeTo} onDone={(id) => hide(`lead-${id}`)} onBusy={(id, on) => setBusy(`lead-${id}`, on)} />
          ))}
        </ul>
      </Section>

      <Section id="inquiries" title="New website inquiries" count={inquiries.length} empty="No new inquiries from the website.">
        <ul className="space-y-3">
          {inquiries.map((i) => (
            <InquiryCard key={i.leadId} item={i} onDone={(id) => hide(`lead-${id}`)} onBusy={(id, on) => setBusy(`lead-${id}`, on)} />
          ))}
        </ul>
      </Section>

      {drafts.length > 0 && (
        <Section id="drafts" title="Drafted emails waiting" count={drafts.length} empty="">
          <WaitingDrafts drafts={drafts} onGone={(id) => hide(`draft-${id}`)} onBusy={setBusy} />
        </Section>
      )}

      {allClear && pipeline.hotProspects > 0 && (
        <div className="card mt-2 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold text-[var(--color-text)]">Nothing is waiting on you.</p>
            <p className="t-small mt-1 text-[var(--color-text-muted)]">
              Next up: {plural(pipeline.hotProspects, "hot prospect", "hot prospects")} Lead Gen found that nobody has emailed yet.
            </p>
          </div>
          <Link href="/admin/lead-gen?min=80&status=new" className="btn btn-primary shrink-0">
            Contact hot prospects
          </Link>
        </div>
      )}

      <p className="mt-12 border-t border-[var(--color-border)] pt-4 t-small text-[var(--color-text-muted)]">
        <Link href="/admin/leads?view=all" className="link">
          {plural(pipeline.leads, "lead", "leads")}
        </Link>
        {" · "}
        <Link href="/admin/customers" className="link">
          {plural(pipeline.customers, "customer", "customers")}
        </Link>
        {" · "}
        <Link href="/admin/lead-gen?min=80&status=new" className="link">
          {plural(pipeline.hotProspects, "hot prospect", "hot prospects")}
        </Link>{" "}
        not contacted yet
      </p>
    </div>
  );
}
