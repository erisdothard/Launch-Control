"use client";

import dynamic from "next/dynamic";

// Client-only: the demo counts every date from the viewer's today, which the server can't know.
const PlanZApp = dynamic(() => import("./PlanZApp"), { ssr: false });

export function PlanZDemo() {
  return <PlanZApp />;
}
