import type { TodayItem } from "@/lib/store/today";
import { canSend } from "./groups";
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

export default function TodayHead({ title, queue, nextUp, stats }: { title: string; queue: TodayItem[]; nextUp: string | null; stats: GlanceStat[] }) {
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
