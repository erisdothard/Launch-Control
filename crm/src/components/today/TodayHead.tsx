import type { TodayItem } from "@/lib/store/today";
import { canSend } from "./groups";
import Link from "next/link";
import type { ApprovalCounts } from "@/lib/store/campaigns";
import styles from "./board.module.css";

/** One figure in the header strip. The page leaves out anything zero or empty. */
export interface GlanceStat {
  label: string;
  value: string;
  small?: string;
}

// Separate counts, never one "people waiting" total: only a reply means someone is waiting on us.
function Lede({ queue, nextUp }: { queue: TodayItem[]; nextUp: string | null }) {
  if (queue.length === 0) {
    return (
      <>
        <b>You&apos;re clear.</b> Nothing needs you right now.{nextUp ? ` ${nextUp}` : ""}
      </>
    );
  }
  const replies = queue.filter((i) => i.kind === "reply").length;
  const inquiries = queue.filter((i) => i.kind === "new").length;
  const followUps = queue.filter((i) => i.kind === "followup");
  const drafted = followUps.filter(canSend).length;
  const rest: string[] = [];
  if (inquiries) rest.push(`${inquiries} new ${inquiries === 1 ? "inquiry" : "inquiries"}`);
  if (followUps.length) {
    const n = followUps.length;
    rest.push(drafted === n ? `${n} follow-up${n === 1 ? "" : "s"} drafted` : `${n} follow-up${n === 1 ? "" : "s"} due`);
  }
  const lead = replies ? `${replies} ${replies === 1 ? "reply" : "replies"} waiting` : null;
  return (
    <>
      {lead && <b>{lead}</b>}
      {lead && rest.length ? ", " : ""}
      {rest.join(", ")}. {queue[0].startHint}
    </>
  );
}

// Draft campaigns send nothing until someone approves them, so they are said first, every visit.
function approvalLine({ batches, campaigns }: ApprovalCounts): string | null {
  const parts: string[] = [];
  if (batches) parts.push(`${batches} ${batches === 1 ? "batch" : "batches"} of first emails`);
  if (campaigns) parts.push(`${campaigns} ${campaigns === 1 ? "campaign" : "campaigns"}`);
  if (!parts.length) return null;
  const many = batches + campaigns > 1;
  return `${parts.join(" and ")} ${many ? "are" : "is"} waiting for your approval. Nothing sends until you approve ${many ? "them" : "it"}.`;
}

export default function TodayHead({ title, queue, nextUp, stats, approvals }: { title: string; queue: TodayItem[]; nextUp: string | null; stats: GlanceStat[]; approvals?: ApprovalCounts }) {
  const approve = approvals ? approvalLine(approvals) : null;
  return (
    <header className={styles.head}>
      <div>
        <div className={styles.stripe} aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.lede}>
          <Lede queue={queue} nextUp={nextUp} />
        </p>
        {approve && (
          <p className={styles.approve}>
            <span>{approve}</span>
            <Link href="/admin/campaigns">Review campaigns</Link>
          </p>
        )}
      </div>
      {stats.length > 0 && (
        <ul className={styles.stats} aria-label="At a glance">
          {stats.map((s) => (
            <li key={s.label}>
              <div className={styles.statK}>{s.label}</div>
              <div className={styles.statV}>
                {s.value}
                {s.small && <small>{s.small}</small>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
