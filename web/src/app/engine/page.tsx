import { notFound } from "next/navigation";
import { EngineClient } from "./EngineClient";

export const metadata = { title: "Engine viewer", robots: { index: false, follow: false } };

/** Dev-only viewer for the real engine asset. 404 in production. */
export default function EnginePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <EngineClient />;
}
