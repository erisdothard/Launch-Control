"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

// Server components render in UTC on Vercel; this formats in the viewer's own time zone.
// Today shows the clock time ("3:14 PM"), any other day the date ("Oct 19"). Tabular digits so a
// column of times lines up; pass className for colour/size.
export default function LocalTime({ iso, className = "" }: { iso: string; className?: string }) {
  const label = useSyncExternalStore(
    noop,
    () => {
      const d = new Date(iso);
      return d.toDateString() === new Date().toDateString()
        ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    },
    () => "",
  );
  return (
    <time dateTime={iso} className={`tabular whitespace-nowrap ${className}`}>
      {label}
    </time>
  );
}
