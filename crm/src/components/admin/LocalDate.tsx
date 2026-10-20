"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

// Pages render in UTC on Vercel; dates formatted there can differ from the viewer's day (or hour)
// and React flags the mismatch. This renders nothing on the server and the local string on mount.
export default function LocalDate({ iso, options }: { iso: string; options: Intl.DateTimeFormatOptions }) {
  const label = useSyncExternalStore(
    noop,
    () => new Date(iso).toLocaleString("en-US", options),
    () => ""
  );
  return <time dateTime={iso}>{label}</time>;
}

/** True once the component has mounted in the browser; false during server render and hydration. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false
  );
}
