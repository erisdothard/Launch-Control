import { redirect } from "next/navigation";

// No public marketing site in this shell yet — it's the CRM half only.
export default function RootPage() {
  redirect("/admin/dashboard");
}
