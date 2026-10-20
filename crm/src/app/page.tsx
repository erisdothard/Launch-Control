import { redirect } from "next/navigation";

// No public marketing site in this shell: the CRM half only. Signed-out visitors are bounced to
// /login by the proxy on /admin/*, so Today is the one place to send everyone.
export default function RootPage() {
  redirect("/admin/today");
}
