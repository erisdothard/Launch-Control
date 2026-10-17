"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

// Server components render in UTC on Vercel; this formats in the viewer's own time zone.
export default function LocalTime({ iso }: { iso: string }) {
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
  return <time dateTime={iso}>{label}</time>;
}
