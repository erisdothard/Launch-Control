"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
const DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

/** A clock time in the viewer's own zone, rendered after mount so the server (UTC) never disagrees. */
export function ClockTime({ iso }: { iso: string }) {
  const label = useSyncExternalStore(noop, () => new Date(iso).toLocaleTimeString("en-US", TIME), () => "");
  return <time dateTime={iso}>{label}</time>;
}

/** "Today 3:12 PM" or "Oct 18" in the viewer's zone, for when something was written. */
export function WhenLabel({ iso }: { iso: string }) {
  const label = useSyncExternalStore(
    noop,
    () => {
      const d = new Date(iso);
      const sameDay = d.toDateString() === new Date().toDateString();
      return sameDay ? `today ${d.toLocaleTimeString("en-US", TIME)}` : d.toLocaleDateString("en-US", DAY);
    },
    () => ""
  );
  return <time dateTime={iso}>{label}</time>;
}
