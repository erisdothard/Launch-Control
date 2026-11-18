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

// Counts as badges, never a sentence: what kind of work, and how much. Separate marks, because
// only a reply means someone is waiting on us. Anything at zero is left out.
function ReplyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 4L2.5 8l4 4M2.5 8h6.5a4.5 4.5 0 014.5 4.5" />
    </svg>
  );
}

function Badges({ queue, approvals }: { queue: TodayItem[]; approvals: number }) {
  const replies = queue.filter((i) => i.kind === "reply").length;
  const inquiries = queue.filter((i) => i.kind === "new").length;
  const followUps = queue.filter((i) => i.kind === "followup");
  const drafted = followUps.filter(canSend).length;
  if (queue.length === 0 && approvals === 0) {
    return (
      <ul className={styles.badges} aria-label="Waiting on you">
        <li className={`${styles.badge} ${styles.bClear}`}>All clear</li>
      </ul>
    );
  }
  return (
    <ul className={styles.badges} aria-label="Waiting on you">
      {replies > 0 && (
        <li className={`${styles.badge} ${styles.bReply}`} aria-label={`${replies} ${replies === 1 ? "reply" : "replies"} waiting`}>
          <ReplyIcon />
          <b>{replies}</b>
          {replies === 1 ? "reply" : "replies"}
        </li>
      )}
      {inquiries > 0 && (
        <li className={`${styles.badge} ${styles.bNew}`}>
          <b>{inquiries}</b>
          new
        </li>
      )}
      {followUps.length > 0 && (
        <li className={`${styles.badge} ${styles.bFollow}`}>
          <b>{followUps.length}</b>
          {followUps.length === 1 ? "follow-up" : "follow-ups"}
          {drafted > 0 && drafted === followUps.length && <span className={styles.badgeSub}>drafted</span>}
        </li>
      )}
      {approvals > 0 && (
        <li>
          <Link href="/admin/campaigns" className={`${styles.badge} ${styles.bApprove}`}>
            <b>{approvals}</b>
            to approve
          </Link>
        </li>
      )}
    </ul>
  );
}

export default function TodayHead({ title, queue, stats, approvals }: { title: string; queue: TodayItem[]; stats: GlanceStat[]; approvals?: ApprovalCounts }) {
  return (
    <header className={styles.head}>
      <div>
        <div className={styles.stripe} aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <h1 className={styles.title}>{title}</h1>
        <Badges queue={queue} approvals={approvals ? approvals.batches + approvals.campaigns : 0} />
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
