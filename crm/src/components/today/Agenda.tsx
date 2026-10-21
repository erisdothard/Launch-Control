"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import type { AgendaEvent } from "@/lib/store/today";

interface AgendaProps {
  events: AgendaEvent[];
  /** The server's clock at render, so the first paint matches; the browser takes over after. */
  nowISO: string;
  timeZone: string;
}

function clock(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", hour12: true })
    .format(d)
    .replace(/\s?[AP]M$/i, "");
}

// "Your day": today's calendar with a NOW line. Past events dim; the next one brightens.
export default function Agenda({ events, nowISO, timeZone }: AgendaProps) {
  const [now, setNow] = useState(() => new Date(nowISO));

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const t = now.getTime();
  const nowIndex = events.findIndex((e) => !e.allDay && new Date(e.startsAt).getTime() > t);
  const insertAt = nowIndex === -1 ? events.length : nowIndex;

  const nowLine = (
    <li key="now" aria-label={`Now, ${clock(now, timeZone)}`} className="flex items-center gap-2.5 py-1.5">
      <span className="font-mono text-[13px] text-[var(--color-text)]">{clock(now, timeZone)}</span>
      <i aria-hidden="true" className="h-px flex-1 bg-[var(--color-text)] opacity-55" />
    </li>
  );

  return (
    <section aria-labelledby="today-day">
      <h2 id="today-day" className="mb-3 flex items-baseline justify-between text-[17px] font-semibold text-[var(--color-text)]">
        Your day
        <Link href="/admin/calendar" className="btn-quiet text-[14px] font-normal">
          Calendar
        </Link>
      </h2>
      {events.length === 0 ? (
        <p className="border-t border-[var(--color-border)] pt-3 text-[15px] text-[var(--color-text-muted)]">Nothing on the calendar today.</p>
      ) : (
        <ul>
          {events.map((e, i) => {
            const past = !e.allDay && new Date(e.endsAt).getTime() <= t;
            const next = i === nowIndex;
            return (
              <Fragment key={e.id}>
                {i === insertAt && nowLine}
                <li className="grid grid-cols-[54px_1fr] gap-3 border-t border-[var(--color-border)] py-3">
                  <span className={`pt-px font-mono text-[14px] ${next ? "text-[var(--color-text)]" : "text-[var(--color-text-dim)]"}`}>{e.time}</span>
                  <div className="min-w-0">
                    <p className={`text-[15px] ${past ? "text-[var(--color-text-dim)]" : "text-[var(--color-text)]"}`}>{e.title}</p>
                    {e.who && <p className="mt-px text-[14px] text-[var(--color-text-muted)]">{e.who}</p>}
                  </div>
                </li>
              </Fragment>
            );
          })}
          {insertAt === events.length && nowLine}
        </ul>
      )}
    </section>
  );
}
