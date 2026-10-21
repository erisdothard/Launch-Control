"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

// Pages render in UTC on Vercel; dates formatted there can differ from the viewer's day (or hour)
// and React flags the mismatch. This renders nothing on the server and the local string on mount.
// v2: digits are tabular so dates line up in lists; pass className for colour/size.
interface LocalDateProps {
  iso: string;
  options: Intl.DateTimeFormatOptions;
  className?: string;
}

export default function LocalDate({ iso, options, className = "" }: LocalDateProps) {
  const label = useSyncExternalStore(
    noop,
    () => new Date(iso).toLocaleString("en-US", options),
    () => ""
  );
  return (
    <time dateTime={iso} className={`tabular ${className}`}>
      {label}
    </time>
  );
}

/** True once the component has mounted in the browser; false during server render and hydration. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false
  );
}
