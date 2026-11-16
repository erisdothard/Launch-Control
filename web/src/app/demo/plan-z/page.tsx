/*
  /demo/plan-z: a clickable example of the driver and booking system for Plan Z Motorsports, the
  link Max sends Jim. Unlisted like the other client demos: noindex, not in the nav or the sitemap.
  All data is example data held in the browser (src/components/planz, src/content/planz.ts).
*/

import type { Metadata } from "next";
import { planz } from "@/content/planz";
import { PlanZDemo } from "@/components/planz/PlanZDemo";

export const metadata: Metadata = {
  title: planz.meta.title,
  description: planz.meta.description,
  robots: { index: false, follow: false },
  alternates: { canonical: "/demo/plan-z" },
  icons: { icon: planz.brand.logo },
  openGraph: { title: planz.meta.title, description: planz.meta.description, url: "/demo/plan-z", images: [planz.brand.hero] },
};

export default function PlanZPage() {
  return <PlanZDemo />;
}
