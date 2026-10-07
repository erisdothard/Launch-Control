import { notFound } from "next/navigation";
import { LabClient } from "./LabClient";

export const metadata = { title: "FX lab", robots: { index: false, follow: false } };

/** Dev-only shader sandbox. 404 in production. */
export default function LabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LabClient />;
}
