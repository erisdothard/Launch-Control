"use client";

import { useEffect, useState } from "react";
import styles from "./board.module.css";

// How long someone has been waiting, on their own row, counting up while the page is open:
// "14m", "2h 05m", "3d 4h". Red once it passes two hours, the same line Today draws for "hot".

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const HOT_AFTER = 2 * HOUR;

export function waited(ms: number): string {
  const t = Math.max(0, ms);
  if (t < HOUR) return `${Math.max(1, Math.floor(t / MIN))}m`;
  if (t < DAY) return `${Math.floor(t / HOUR)}h ${String(Math.floor((t % HOUR) / MIN)).padStart(2, "0")}m`;
  return `${Math.floor(t / DAY)}d ${Math.floor((t % DAY) / HOUR)}h`;
}

export default function WaitTimer({ since, label }: { since: string; label: string }) {
  // Null until mounted: the server and the browser would disagree about "now".
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, MIN);
    return () => window.clearInterval(id);
  }, []);

  if (now === null) return <span className={styles.when}>{label}</span>;
  const ms = now - new Date(since).getTime();
  return (
    <span className={`${styles.when} ${ms > HOT_AFTER ? styles.timerHot : ""}`} title={label}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 4.8V8l2.2 1.5" />
      </svg>
      <span aria-hidden="true">{waited(ms)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
